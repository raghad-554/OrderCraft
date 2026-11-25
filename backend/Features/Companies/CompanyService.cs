using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;
using OrderCraft.Tenancy;

namespace OrderCraft.Services;

public class CompanyService : ICompanyService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IAuditService _auditService;
    private readonly ITenantContext _tenant;

    public CompanyService(ApplicationDbContext dbContext, IAuditService auditService, ITenantContext tenant)
    {
        _dbContext = dbContext;
        _auditService = auditService;
        _tenant = tenant;
    }

    public async Task<IReadOnlyList<CompanyResponse>> GetAllAsync(
        CompanyType[]? types = null,
        string? name = null,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Companies
            .AsNoTracking()
            .Include(c => c.Category)
            .AsQueryable();

        if (types is { Length: > 0 })
            query = query.Where(c => types.Contains(c.Type));

        if (!string.IsNullOrWhiteSpace(name))
        {
            var term = $"%{name.Trim()}%";
            query = query.Where(c => EF.Functions.ILike(c.Name, term));
        }

        var companies = await query
            .OrderBy(c => c.Name)
            .ToListAsync(cancellationToken);

        var responses = companies.Select(ProcurementMappings.ToResponse).ToList();
        await StampOutstandingBalancesAsync(responses, cancellationToken);
        return responses;
    }

    public async Task<CompanyResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var company = await _dbContext.Companies
            .AsNoTracking()
            .Include(c => c.Category)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (company is null)
            return null;

        var response = ProcurementMappings.ToResponse(company);
        await StampOutstandingBalancesAsync([response], cancellationToken);
        return response;
    }

    public async Task<IReadOnlyList<CompanyResponse>> SearchByNameAsync(
        string name,
        CancellationToken cancellationToken = default)
    {
        return await GetAllAsync(types: null, name: name, cancellationToken);
    }

    public async Task<(CompanyResponse? Company, string? ConflictMessage)> CreateAsync(
        CreateCompanyRequest request,
        CancellationToken cancellationToken = default)
    {
        var conflict = await GetEmailConflictAsync(request.Email, excludeId: null, cancellationToken);
        if (conflict is not null)
            return (null, conflict);

        var categoryError = await ValidateCategoryAsync(request.CategoryId, cancellationToken);
        if (categoryError is not null)
            return (null, categoryError);

        var company = new Company
        {
            OrganizationId = _tenant.RequireOrganizationId(),
            CreatedAt = DateTime.UtcNow,
            IsDeleted = false
        };
        ApplyFields(company, request);

        _dbContext.Companies.Add(company);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Created",
            entityType: "Company",
            entityId: company.Id.ToString(),
            entityLabel: company.Name,
            summary: $"Company created as {company.Type}.",
            cancellationToken: cancellationToken);

        await _dbContext.Entry(company).Reference(c => c.Category).LoadAsync(cancellationToken);
        var created = ProcurementMappings.ToResponse(company);
        await StampOutstandingBalancesAsync([created], cancellationToken);
        return (created, null);
    }

    public async Task<(CompanyResponse? Company, string? ConflictMessage)> UpdateAsync(
        Guid id,
        UpdateCompanyRequest request,
        CancellationToken cancellationToken = default)
    {
        var company = await _dbContext.Companies
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (company is null)
            return (null, null);

        var conflict = await GetEmailConflictAsync(request.Email, excludeId: id, cancellationToken);
        if (conflict is not null)
            return (null, conflict);

        var categoryError = await ValidateCategoryAsync(request.CategoryId, cancellationToken);
        if (categoryError is not null)
            return (null, categoryError);

        var typeError = await ValidateTypeChangeAsync(company.Id, request.Type, cancellationToken);
        if (typeError is not null)
            return (null, typeError);

        ApplyFields(company, request);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Updated",
            entityType: "Company",
            entityId: company.Id.ToString(),
            entityLabel: company.Name,
            summary: "Company details updated.",
            cancellationToken: cancellationToken);

        await _dbContext.Entry(company).Reference(c => c.Category).LoadAsync(cancellationToken);
        var updated = ProcurementMappings.ToResponse(company);
        await StampOutstandingBalancesAsync([updated], cancellationToken);
        return (updated, null);
    }

    public async Task<(bool Deleted, string? ErrorMessage)> SoftDeleteAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var company = await _dbContext.Companies
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (company is null)
            return (false, null);

        var onOrders = await _dbContext.Orders.AnyAsync(
            o => o.BuyerCompanyId == id || o.SupplierCompanyId == id,
            cancellationToken);
        if (onOrders)
            return (false, "This vendor/product is used on purchase orders.");

        company.IsDeleted = true;
        company.DeletedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Deleted",
            entityType: "Company",
            entityId: company.Id.ToString(),
            entityLabel: company.Name,
            summary: "Company soft-deleted.",
            cancellationToken: cancellationToken);

        return (true, null);
    }

    private static void ApplyFields(Company company, CompanyRequestBase request)
    {
        company.Name = request.Name.Trim();
        company.Email = request.Email.Trim();
        company.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        company.Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
        company.TaxNumber = string.IsNullOrWhiteSpace(request.TaxNumber) ? null : request.TaxNumber.Trim();
        company.Type = request.Type;
        company.CategoryId = request.CategoryId;
        company.CreditLimit = request.CreditLimit;
        company.PaymentTerm = string.IsNullOrWhiteSpace(request.PaymentTerm)
            ? null
            : request.PaymentTerm.Trim();
        company.DiscountRate = request.DiscountRate;
        company.TotalSpend = request.TotalSpend ?? 0;
        company.TotalSales = request.TotalSales ?? 0;
        company.PerformanceScore = request.PerformanceScore;
        company.Status = request.Status;
    }

    private async Task<string?> ValidateTypeChangeAsync(
        Guid companyId,
        CompanyType type,
        CancellationToken cancellationToken)
    {
        if (type is CompanyType.Buyer)
        {
            var hasProducts = await _dbContext.Products.AnyAsync(
                p => p.CompanyId == companyId,
                cancellationToken);
            if (hasProducts)
                return "This company still has products. Move or remove them before saving as a client only.";

            var isVendorOnOrders = await _dbContext.Orders.AnyAsync(
                o => o.SupplierCompanyId == companyId,
                cancellationToken);
            if (isVendorOnOrders)
                return "This vendor is used on purchase orders.";
        }

        if (type is CompanyType.Supplier)
        {
            var isBuyerOnOrders = await _dbContext.Orders.AnyAsync(
                o => o.BuyerCompanyId == companyId,
                cancellationToken);
            if (isBuyerOnOrders)
                return "This client is used on purchase orders.";
        }

        return null;
    }

    private async Task<string?> ValidateCategoryAsync(
        Guid? categoryId,
        CancellationToken cancellationToken)
    {
        if (!categoryId.HasValue)
            return null;

        var exists = await _dbContext.Categories
            .AnyAsync(c => c.Id == categoryId.Value, cancellationToken);

        return exists ? null : "CategoryId does not exist.";
    }

    private async Task<string?> GetEmailConflictAsync(
        string email,
        Guid? excludeId,
        CancellationToken cancellationToken)
    {
        var normalized = email.Trim().ToLower();
        var orgId = _tenant.RequireOrganizationId();
        var query = _dbContext.Companies
            .IgnoreQueryFilters()
            .Where(c => !c.IsDeleted && c.OrganizationId == orgId);

        if (excludeId.HasValue)
            query = query.Where(c => c.Id != excludeId.Value);

        return await query.AnyAsync(c => c.Email.ToLower() == normalized, cancellationToken)
            ? "Email is already taken."
            : null;
    }

    private async Task StampOutstandingBalancesAsync(
        IReadOnlyList<CompanyResponse> companies,
        CancellationToken cancellationToken)
    {
        if (companies.Count == 0)
            return;

        var invoices = await _dbContext.Invoices
            .AsNoTracking()
            .Include(i => i.Order)
            .Include(i => i.Payments)
            .ToListAsync(cancellationToken);

        var receivable = new Dictionary<Guid, decimal>();
        var payable = new Dictionary<Guid, decimal>();
        foreach (var invoice in invoices)
        {
            var order = invoice.Order;
            if (order is null)
                continue;

            var amount = InvoiceMoney.Outstanding(invoice);
            if (order.Direction == OrderDirection.Sale)
            {
                if (order.BuyerCompanyId is Guid clientId)
                    receivable[clientId] = receivable.GetValueOrDefault(clientId) + amount;
            }
            else if (order.SupplierCompanyId is Guid vendorId)
            {
                payable[vendorId] = payable.GetValueOrDefault(vendorId) + amount;
            }
        }

        foreach (var company in companies)
        {
            company.OutstandingBalance = receivable.GetValueOrDefault(company.Id);
            company.PayableBalance = payable.GetValueOrDefault(company.Id);
        }
    }
}
