using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public class InvoiceService : IInvoiceService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IAuditService _auditService;
    private readonly ITenantContext _tenant;

    public InvoiceService(ApplicationDbContext dbContext, IAuditService auditService, ITenantContext tenant)
    {
        _dbContext = dbContext;
        _auditService = auditService;
        _tenant = tenant;
    }

    public async Task<IReadOnlyList<InvoiceResponse>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var invoices = await Query()
            .OrderByDescending(i => i.DueDate)
            .ToListAsync(cancellationToken);

        return invoices.Select(ProcurementMappings.ToResponse).ToList();
    }

    public async Task<InvoiceResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var invoice = await Query()
            .FirstOrDefaultAsync(i => i.Id == id, cancellationToken);

        return invoice is null ? null : ProcurementMappings.ToResponse(invoice);
    }

    public async Task<IReadOnlyList<InvoiceResponse>> SearchByInvoiceNumberAsync(
        string invoiceNumber,
        CancellationToken cancellationToken = default)
    {
        var term = $"%{invoiceNumber.Trim()}%";
        var invoices = await Query()
            .Where(i => EF.Functions.ILike(i.InvoiceNumber, term))
            .OrderByDescending(i => i.DueDate)
            .ToListAsync(cancellationToken);

        return invoices.Select(ProcurementMappings.ToResponse).ToList();
    }

    public async Task<(InvoiceResponse? Invoice, string? ConflictMessage)> CreateAsync(
        CreateInvoiceRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        await LockRowAsync("Orders", request.OrderId, cancellationToken);

        var order = await _dbContext.Orders
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken);

        var invoiced = order is null
            ? 0m
            : await InvoicedAmountAsync(order.Id, excludeInvoiceId: null, cancellationToken);
        var eligibility = InvoiceRules.EligibilityError(order, invoiced);
        if (eligibility is not null || order is null)
            return (null, eligibility == "Order not found." ? "OrderId does not exist." : eligibility);

        var amountError = InvoiceRules.AmountError(
            request.Amount,
            InvoiceMoney.Remaining(order.TotalAmount, invoiced));
        if (amountError is not null)
            return (null, amountError);

        var conflict = await GetConflictAsync(request.InvoiceNumber, cancellationToken);
        if (conflict is not null)
            return (null, conflict);

        var invoice = new Invoice
        {
            OrganizationId = _tenant.RequireOrganizationId(),
            OrderId = request.OrderId,
            Currency = await ResolveInvoiceCurrencyAsync(order, cancellationToken),
            IsDeleted = false
        };
        ApplyFields(invoice, request);

        _dbContext.Invoices.Add(invoice);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Created",
            entityType: "Invoice",
            entityId: invoice.Id.ToString(),
            entityLabel: invoice.InvoiceNumber,
            summary: $"Invoice created for order {order.OrderNumber} ({invoice.Status}).",
            cancellationToken: cancellationToken);

        var created = await GetByIdAsync(invoice.Id, cancellationToken);
        return (created, null);
    }

    public async Task<(InvoiceResponse? Invoice, string? ConflictMessage)> CreateFromOrderAsync(
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var order = await _dbContext.Orders
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken);

        var invoiced = order is null
            ? 0m
            : await InvoicedAmountAsync(order.Id, excludeInvoiceId: null, cancellationToken);
        var eligibility = InvoiceRules.EligibilityError(order, invoiced);
        if (eligibility is not null || order is null)
            return (null, eligibility);

        var request = new CreateInvoiceRequest
        {
            OrderId = order.Id,
            InvoiceNumber = await NextInvoiceNumberAsync(order.OrderNumber, cancellationToken),
            Amount = InvoiceMoney.Remaining(order.TotalAmount, invoiced),
            Status = InvoiceStatus.Unpaid,
            DueDate = DateTime.UtcNow.Date.AddDays(30)
        };

        return await CreateAsync(request, cancellationToken);
    }

    public async Task<(InvoiceResponse? Invoice, string? ConflictMessage)> UpdateAsync(
        Guid id,
        UpdateInvoiceRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        await LockRowAsync("Invoices", id, cancellationToken);

        var invoice = await _dbContext.Invoices
            .Include(i => i.Payments)
            .FirstOrDefaultAsync(i => i.Id == id, cancellationToken);

        if (invoice is null)
            return (null, null);

        await LockRowAsync("Orders", invoice.OrderId, cancellationToken);

        if (InvoiceMoney.Round(request.Amount) < InvoiceMoney.Paid(invoice))
            return (null, "Amount cannot be less than the amount already paid.");

        var orderTotal = await _dbContext.Orders
            .Where(o => o.Id == invoice.OrderId)
            .Select(o => o.TotalAmount)
            .FirstOrDefaultAsync(cancellationToken);
        var invoicedOthers = await InvoicedAmountAsync(invoice.OrderId, invoice.Id, cancellationToken);
        var amountError = InvoiceRules.AmountError(
            request.Amount,
            InvoiceMoney.Remaining(orderTotal, invoicedOthers));
        if (amountError is not null)
            return (null, amountError);

        var conflict = await GetConflictAsync(request.InvoiceNumber, cancellationToken, excludeId: id);
        if (conflict is not null)
            return (null, conflict);

        ApplyFields(invoice, request);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Updated",
            entityType: "Invoice",
            entityId: invoice.Id.ToString(),
            entityLabel: invoice.InvoiceNumber,
            summary: $"Invoice updated ({invoice.Status}).",
            cancellationToken: cancellationToken);

        var updated = await GetByIdAsync(invoice.Id, cancellationToken);
        return (updated, null);
    }

    public async Task<bool> SoftDeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var invoice = await _dbContext.Invoices
            .FirstOrDefaultAsync(i => i.Id == id, cancellationToken);

        if (invoice is null)
            return false;

        var number = invoice.InvoiceNumber;
        invoice.IsDeleted = true;
        invoice.DeletedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Deleted",
            entityType: "Invoice",
            entityId: id.ToString(),
            entityLabel: number,
            summary: "Invoice soft-deleted.",
            cancellationToken: cancellationToken);

        return true;
    }

    public async Task<(InvoiceResponse? Invoice, string? Error)> RecordPaymentAsync(
        Guid id,
        decimal amount,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        await LockRowAsync("Invoices", id, cancellationToken);

        var invoice = await _dbContext.Invoices
            .Include(i => i.Payments)
            .FirstOrDefaultAsync(i => i.Id == id, cancellationToken);

        if (invoice is null)
            return (null, null);

        var paymentAmount = InvoiceMoney.Round(amount);
        if (paymentAmount <= 0m)
            return (null, "Payment amount must be greater than 0.");

        var outstanding = InvoiceMoney.Outstanding(invoice);
        if (outstanding <= 0m)
            return (null, "This invoice is already paid.");
        if (paymentAmount > outstanding)
            return (null, $"Payment cannot be more than the outstanding balance of {outstanding:0.00}.");

        var recordedByName = "User";
        if (_tenant.UserId is { } userId)
        {
            var name = await _dbContext.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => u.FullName)
                .FirstOrDefaultAsync(cancellationToken);
            if (!string.IsNullOrWhiteSpace(name))
                recordedByName = name.Trim();
        }

        var since = DateTime.UtcNow.Subtract(InvoiceMoney.DuplicatePaymentWindow);
        var duplicate = invoice.Payments.Any(payment =>
            payment.Amount == paymentAmount
            && payment.RecordedByUserId == _tenant.UserId
            && payment.PaidAt >= since);
        if (duplicate)
            return (null, "This payment was already recorded.");

        var payment = new Payment
        {
            OrganizationId = _tenant.OrganizationId,
            InvoiceId = invoice.Id,
            Amount = paymentAmount,
            RecordedByUserId = _tenant.UserId,
            RecordedByName = recordedByName,
            PaidAt = DateTime.UtcNow
        };
        _dbContext.Payments.Add(payment);
        _dbContext.Entry(payment).State = EntityState.Added;
        invoice.Payments.Add(payment);
        invoice.Status = paymentAmount >= outstanding
            ? InvoiceStatus.Paid
            : InvoiceStatus.PartiallyPaid;
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Payment",
            entityType: "Invoice",
            entityId: invoice.Id.ToString(),
            entityLabel: invoice.InvoiceNumber,
            summary: $"Payment of {paymentAmount:0.00} recorded. Outstanding {InvoiceMoney.Outstanding(invoice):0.00}.",
            cancellationToken: cancellationToken);

        return (await GetByIdAsync(invoice.Id, cancellationToken), null);
    }

    private IQueryable<Invoice> Query() =>
        _dbContext.Invoices
            .AsNoTracking()
            .Include(i => i.Payments)
            .Include(i => i.Order)
                .ThenInclude(o => o.BuyerCompany)
            .Include(i => i.Order)
                .ThenInclude(o => o.SupplierCompany);

    private static void ApplyFields(Invoice invoice, InvoiceRequestBase request)
    {
        invoice.InvoiceNumber = request.InvoiceNumber.Trim();
        invoice.Amount = InvoiceMoney.Round(request.Amount);
        invoice.DueDate = NormalizeUtc(request.DueDate);
        invoice.Status = InvoiceMoney.Status(invoice);
    }

    private async Task<string> ResolveInvoiceCurrencyAsync(Order order, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(order.Currency))
            return order.Currency.Trim().ToUpperInvariant();

        var orgId = _tenant.RequireOrganizationId();
        var currency = await _dbContext.Organizations
            .AsNoTracking()
            .Where(o => o.Id == orgId)
            .Select(o => o.DefaultCurrency)
            .FirstOrDefaultAsync(cancellationToken);
        return string.IsNullOrWhiteSpace(currency) ? "USD" : currency.Trim().ToUpperInvariant();
    }

    private static DateTime NormalizeUtc(DateTime value) =>
        value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };

    private async Task<string?> GetConflictAsync(
        string invoiceNumber,
        CancellationToken cancellationToken,
        Guid? excludeId = null)
    {
        var normalized = invoiceNumber.Trim().ToLower();

        var orgId = _tenant.RequireOrganizationId();
        var query = _dbContext.Invoices
            .IgnoreQueryFilters()
            .Where(i => !i.IsDeleted && i.OrganizationId == orgId);

        if (excludeId.HasValue)
            query = query.Where(i => i.Id != excludeId.Value);

        return await query.AnyAsync(i => i.InvoiceNumber.ToLower() == normalized, cancellationToken)
            ? "InvoiceNumber is already taken."
            : null;
    }

    private async Task<decimal> InvoicedAmountAsync(
        Guid orderId,
        Guid? excludeInvoiceId,
        CancellationToken cancellationToken)
    {
        var query = _dbContext.Invoices.Where(invoice => invoice.OrderId == orderId);
        if (excludeInvoiceId.HasValue)
            query = query.Where(invoice => invoice.Id != excludeInvoiceId.Value);

        var total = await query.SumAsync(invoice => (decimal?)invoice.Amount, cancellationToken) ?? 0m;
        return InvoiceMoney.Round(total);
    }

    private async Task<string> NextInvoiceNumberAsync(string orderNumber, CancellationToken cancellationToken)
    {
        var baseNumber = $"INV-{orderNumber.Trim()}";
        var prefix = baseNumber.ToLower();
        var orgId = _tenant.RequireOrganizationId();
        var taken = await _dbContext.Invoices
            .IgnoreQueryFilters()
            .Where(invoice => !invoice.IsDeleted && invoice.OrganizationId == orgId)
            .Where(invoice =>
                invoice.InvoiceNumber.ToLower() == prefix
                || invoice.InvoiceNumber.ToLower().StartsWith(prefix + "-"))
            .Select(invoice => invoice.InvoiceNumber)
            .ToListAsync(cancellationToken);
        var used = taken.Select(number => number.ToLower()).ToHashSet();
        if (!used.Contains(prefix))
            return baseNumber;

        for (var sequence = 2; sequence < 1000; sequence++)
        {
            var candidate = $"{baseNumber}-{sequence}";
            if (!used.Contains(candidate.ToLower()))
                return candidate;
        }

        return $"{baseNumber}-{Guid.NewGuid():N}"[..50];
    }

    private async Task LockRowAsync(string table, Guid id, CancellationToken cancellationToken)
    {
        var sql = table switch
        {
            "Orders" => """SELECT 1 FROM "Orders" WHERE "Id" = @id FOR UPDATE""",
            "Invoices" => """SELECT 1 FROM "Invoices" WHERE "Id" = @id FOR UPDATE""",
            _ => throw new InvalidOperationException("Unsupported row lock.")
        };

        var connection = _dbContext.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
            await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.Transaction = _dbContext.Database.CurrentTransaction?.GetDbTransaction();
        command.CommandText = sql;
        var parameter = command.CreateParameter();
        parameter.ParameterName = "id";
        parameter.Value = id;
        command.Parameters.Add(parameter);
        await command.ExecuteScalarAsync(cancellationToken);
    }
}
