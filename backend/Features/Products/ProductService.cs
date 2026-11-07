using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public class ProductService : IProductService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IAuditService _auditService;
    private readonly ITenantContext _tenant;

    public ProductService(ApplicationDbContext dbContext, IAuditService auditService, ITenantContext tenant)
    {
        _dbContext = dbContext;
        _auditService = auditService;
        _tenant = tenant;
    }

    public async Task<IReadOnlyList<ProductResponse>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var products = await Query()
            .OrderBy(p => p.Name)
            .ToListAsync(cancellationToken);

        return products.Select(ProcurementMappings.ToResponse).ToList();
    }

    public async Task<ProductResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var product = await Query()
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);

        return product is null ? null : ProcurementMappings.ToResponse(product);
    }

    public async Task<IReadOnlyList<ProductResponse>> SearchByNameAsync(
        string name,
        CancellationToken cancellationToken = default)
    {
        var term = $"%{name.Trim()}%";
        var products = await Query()
            .Where(p => EF.Functions.ILike(p.Name, term) || EF.Functions.ILike(p.SKU, term))
            .OrderBy(p => p.Name)
            .ToListAsync(cancellationToken);

        return products.Select(ProcurementMappings.ToResponse).ToList();
    }

    public async Task<(ProductResponse? Product, string? ConflictMessage)> CreateAsync(
        CreateProductRequest request,
        CancellationToken cancellationToken = default)
    {
        var vendorError = await ValidateVendorAsync(request.CompanyId, cancellationToken);
        if (vendorError is not null)
            return (null, vendorError);

        var categoryError = await ValidateCategoryAsync(request.CategoryId, cancellationToken);
        if (categoryError is not null)
            return (null, categoryError);

        var conflict = await GetSkuConflictAsync(request.CompanyId, request.SKU, excludeId: null, cancellationToken);
        if (conflict is not null)
            return (null, conflict);

        var product = new Product
        {
            OrganizationId = _tenant.RequireOrganizationId(),
            CompanyId = request.CompanyId,
            IsDeleted = false
        };
        ApplyFields(product, request);

        _dbContext.Products.Add(product);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Created",
            entityType: "Product",
            entityId: product.Id.ToString(),
            entityLabel: product.Name,
            summary: $"Product {product.SKU} created.",
            cancellationToken: cancellationToken);

        var created = await GetByIdAsync(product.Id, cancellationToken);
        return (created, null);
    }

    public async Task<(ProductResponse? Product, string? ConflictMessage)> UpdateAsync(
        Guid id,
        UpdateProductRequest request,
        CancellationToken cancellationToken = default)
    {
        var product = await _dbContext.Products
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);

        if (product is null)
            return (null, null);

        if (product.CompanyId != request.CompanyId)
        {
            var onOrders = await _dbContext.OrderItems.AnyAsync(
                item => item.ProductId == id && !item.Order.IsDeleted,
                cancellationToken);
            if (onOrders)
                return (null, "This vendor/product is used on purchase orders.");
        }

        var vendorError = await ValidateVendorAsync(request.CompanyId, cancellationToken);
        if (vendorError is not null)
            return (null, vendorError);

        var categoryError = await ValidateCategoryAsync(request.CategoryId, cancellationToken);
        if (categoryError is not null)
            return (null, categoryError);

        var conflict = await GetSkuConflictAsync(request.CompanyId, request.SKU, excludeId: id, cancellationToken);
        if (conflict is not null)
            return (null, conflict);

        product.CompanyId = request.CompanyId;
        ApplyFields(product, request);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Updated",
            entityType: "Product",
            entityId: product.Id.ToString(),
            entityLabel: product.Name,
            summary: $"Product {product.SKU} updated.",
            cancellationToken: cancellationToken);

        var updated = await GetByIdAsync(product.Id, cancellationToken);
        return (updated, null);
    }

    public async Task<(bool Deleted, string? ErrorMessage)> SoftDeleteAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var product = await _dbContext.Products
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);

        if (product is null)
            return (false, null);

        var onOrders = await _dbContext.OrderItems.AnyAsync(
            item => item.ProductId == id && !item.Order.IsDeleted,
            cancellationToken);
        if (onOrders)
            return (false, "This vendor/product is used on purchase orders.");

        var label = product.Name;
        var sku = product.SKU;
        product.IsDeleted = true;
        product.DeletedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Deleted",
            entityType: "Product",
            entityId: id.ToString(),
            entityLabel: label,
            summary: $"Product {sku} soft-deleted.",
            cancellationToken: cancellationToken);

        return (true, null);
    }

    private IQueryable<Product> Query() =>
        _dbContext.Products
            .AsNoTracking()
            .Include(p => p.Company)
            .Include(p => p.Category);

    private static void ApplyFields(Product product, ProductRequestBase request)
    {
        product.Name = request.Name.Trim();
        product.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        product.SKU = request.SKU.Trim();
        product.CategoryId = request.CategoryId;
        product.Price = request.Price;
        product.StockQuantity = request.StockQuantity;
        product.IsActive = request.IsActive;
    }

    private async Task<string?> ValidateVendorAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var company = await _dbContext.Companies
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == companyId, cancellationToken);

        if (company is null)
            return "Vendor company does not exist.";

        if (company.Type is not CompanyType.Supplier and not CompanyType.Both)
            return "Vendor must be a Supplier or Both company type.";

        return null;
    }

    private async Task<string?> ValidateCategoryAsync(Guid? categoryId, CancellationToken cancellationToken)
    {
        if (!categoryId.HasValue)
            return null;

        var exists = await _dbContext.Categories
            .AnyAsync(c => c.Id == categoryId.Value, cancellationToken);

        return exists ? null : "Category does not exist.";
    }

    private async Task<string?> GetSkuConflictAsync(
        Guid companyId,
        string sku,
        Guid? excludeId,
        CancellationToken cancellationToken)
    {
        var normalized = sku.Trim().ToLower();
        var query = _dbContext.Products.IgnoreQueryFilters()
            .Where(p => p.CompanyId == companyId && !p.IsDeleted);

        if (excludeId.HasValue)
            query = query.Where(p => p.Id != excludeId.Value);

        return await query.AnyAsync(p => p.SKU.ToLower() == normalized, cancellationToken)
            ? "SKU already exists for this vendor."
            : null;
    }
}
