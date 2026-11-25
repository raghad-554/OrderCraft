using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;
using OrderCraft.Tenancy;

namespace OrderCraft.Services;

public class OrderService : IOrderService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IAuditService _auditService;
    private readonly ITenantContext _tenant;

    public OrderService(ApplicationDbContext dbContext, IAuditService auditService, ITenantContext tenant)
    {
        _dbContext = dbContext;
        _auditService = auditService;
        _tenant = tenant;
    }

    public async Task<IReadOnlyList<OrderResponse>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var orders = await _dbContext.Orders
            .AsNoTracking()
            .Include(o => o.OrderItems)
                .ThenInclude(i => i.Product)
            .Include(o => o.BuyerCompany)
            .Include(o => o.SupplierCompany)
            .Include(o => o.Invoices)
                .ThenInclude(i => i.Payments)
            .OrderByDescending(o => o.OrderDate)
            .ToListAsync(cancellationToken);

        var responses = orders.Select(ProcurementMappings.ToResponse).ToList();
        await StampApprovalThresholdAsync(responses, cancellationToken);
        return responses;
    }

    public async Task<OrderResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var order = await _dbContext.Orders
            .AsNoTracking()
            .Include(o => o.OrderItems)
                .ThenInclude(i => i.Product)
            .Include(o => o.BuyerCompany)
            .Include(o => o.SupplierCompany)
            .Include(o => o.Invoices)
                .ThenInclude(i => i.Payments)
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);

        if (order is null)
            return null;

        var response = ProcurementMappings.ToResponse(order);
        await StampApprovalThresholdAsync([response], cancellationToken);
        return response;
    }

    public async Task<IReadOnlyList<OrderResponse>> SearchByOrderNumberAsync(
        string orderNumber,
        CancellationToken cancellationToken = default)
    {
        var term = $"%{orderNumber.Trim()}%";
        var orders = await _dbContext.Orders
            .AsNoTracking()
            .Include(o => o.OrderItems)
                .ThenInclude(i => i.Product)
            .Include(o => o.BuyerCompany)
            .Include(o => o.SupplierCompany)
            .Include(o => o.Invoices)
                .ThenInclude(i => i.Payments)
            .Where(o => EF.Functions.ILike(o.OrderNumber, term))
            .OrderByDescending(o => o.OrderDate)
            .ToListAsync(cancellationToken);

        var responses = orders.Select(ProcurementMappings.ToResponse).ToList();
        await StampApprovalThresholdAsync(responses, cancellationToken);
        return responses;
    }

    public async Task<(OrderResponse? Order, string? ConflictMessage)> CreateAsync(
        CreateOrderRequest request,
        Guid createdByUserId,
        CancellationToken cancellationToken = default)
    {
        if (request.Status is not OrderStatus.Draft and not OrderStatus.Pending)
            return (null, "New orders must be Draft or Pending.");

        var (parties, validationError) = await ResolvePartiesAsync(
            request.Direction,
            request.PartnerCompanyId,
            createdByUserId,
            request.OrderItems.Select(i => i.ProductId),
            cancellationToken);

        if (validationError is not null || parties is not OrderParties resolved)
            return (null, validationError);

        var orderNumberConflict = await GetOrderNumberConflictAsync(
            request.OrderNumber,
            excludeId: null,
            cancellationToken);
        if (orderNumberConflict is not null)
            return (null, orderNumberConflict);

        var items = request.OrderItems.Select(i =>
        {
            var (discount, total) = OrderItemPricing.Price(i.Quantity, i.UnitPrice, i.DiscountAmount);
            return new OrderItem
            {
                Id = Guid.NewGuid(),
                ProductId = i.ProductId,
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice,
                DiscountAmount = discount,
                TotalPrice = total
            };
        }).ToList();

        if (request.Direction == OrderDirection.Sale && request.Status == OrderStatus.Pending)
        {
            var stockError = await EnsureSaleStockAvailableAsync(
                items.Select(i => (i.ProductId, i.Quantity)),
                cancellationToken);
            if (stockError is not null)
                return (null, stockError);
        }

        var taxRate = NormalizeTaxRate(request.TaxRate);
        var subtotal = items.Sum(i => i.TotalPrice);

        var order = new Order
        {
            OrganizationId = _tenant.RequireOrganizationId(),
            OrderNumber = request.OrderNumber.Trim(),
            Direction = request.Direction,
            BuyerCompanyId = resolved.BuyerCompanyId,
            BuyerCompanyName = resolved.BuyerCompanyName,
            SupplierCompanyId = resolved.SupplierCompanyId,
            SupplierCompanyName = resolved.SupplierCompanyName,
            CreatedByUserId = createdByUserId,
            Status = request.Status,
            Currency = await CurrentOrgCurrencyAsync(cancellationToken),
            OrderDate = request.OrderDate ?? DateTime.UtcNow,
            DeliveryDate = NormalizeOptionalUtc(request.DeliveryDate),
            PaymentTerms = request.PaymentTerms,
            TaxRate = taxRate,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            TotalAmount = ComputeGrandTotal(subtotal, taxRate),
            OrderItems = items,
            IsDeleted = false
        };

        _dbContext.Orders.Add(order);
        await AdjustOrderCountAsync(resolved.PartnerCompanyId, delta: 1, cancellationToken);
        var createdNames = await LoadProductNamesAsync(items.Select(i => i.ProductId), cancellationToken);
        await AddFieldChangesAsync(
            order.Id,
            OrderFieldHistory.ForCreate(HeaderFrom(order), LinesFrom(items, createdNames)),
            cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Created",
            entityType: "Order",
            entityId: order.Id.ToString(),
            entityLabel: order.OrderNumber,
            summary: $"Order created with status {order.Status}.",
            cancellationToken: cancellationToken);

        var created = await GetByIdAsync(order.Id, cancellationToken);
        return (created, null);
    }

    public async Task<(OrderResponse? Order, string? ConflictMessage)> UpdateAsync(
        Guid id,
        UpdateOrderRequest request,
        CancellationToken cancellationToken = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);

        if (order is null)
            return (null, null);

        if (!OrderStateMachine.CanEditDetails(order.Status))
            return (null, "Only draft or rejected orders can be edited.");

        var wasRejected = order.Status == OrderStatus.Rejected;
        var nextStatus = wasRejected ? OrderStatus.Pending : request.Status;
        if (nextStatus != order.Status)
        {
            var transitionError = OrderStateMachine.TransitionError(order.Status, nextStatus);
            if (transitionError is not null)
                return (null, transitionError);
        }

        var productIds = request.OrderItems?.Select(i => i.ProductId);

        var (parties, validationError) = await ResolvePartiesAsync(
            request.Direction,
            request.PartnerCompanyId,
            order.CreatedByUserId,
            productIds,
            cancellationToken);

        if (validationError is not null || parties is not OrderParties resolved)
            return (null, validationError);

        var orderNumberConflict = await GetOrderNumberConflictAsync(
            request.OrderNumber,
            excludeId: id,
            cancellationToken);
        if (orderNumberConflict is not null)
            return (null, orderNumberConflict);

        var previousCompanyIds = PartyIds(order.BuyerCompanyId, order.SupplierCompanyId);
        var trackedProductIds = order.OrderItems.Select(i => i.ProductId)
            .Concat(request.OrderItems?.Select(i => i.ProductId) ?? [])
            .Distinct()
            .ToList();
        var productNames = await LoadProductNamesAsync(trackedProductIds, cancellationToken);
        var beforeHeader = HeaderFrom(order);
        var beforeLines = LinesFrom(order.OrderItems, productNames);

        var nextDeliveryDate = NormalizeOptionalUtc(request.DeliveryDate);
        var nextTaxRate = NormalizeTaxRate(request.TaxRate);
        var nextNotes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();

        var afterLines = request.OrderItems is { Count: > 0 }
            ? LinesFrom(request.OrderItems.Select(line =>
            {
                var (discount, total) = OrderItemPricing.Price(line.Quantity, line.UnitPrice, line.DiscountAmount);
                return new OrderItem
                {
                    ProductId = line.ProductId,
                    Quantity = line.Quantity,
                    UnitPrice = line.UnitPrice,
                    DiscountAmount = discount,
                    TotalPrice = total
                };
            }), productNames)
            : beforeLines;

        var proposedHeader = new OrderFieldHistory.HeaderSnap(
            resolved.BuyerCompanyName,
            resolved.SupplierCompanyName,
            nextDeliveryDate,
            request.PaymentTerms,
            nextTaxRate,
            nextNotes,
            order.Status,
            request.Direction);

        if (wasRejected && !OrderFieldHistory.HasContentChanges(
                beforeHeader,
                proposedHeader,
                beforeLines,
                afterLines,
                order.OrderNumber,
                request.OrderNumber))
        {
            return (null, "Change at least one field before resubmitting.");
        }

        if (request.Direction == OrderDirection.Sale && nextStatus == OrderStatus.Pending)
        {
            var stockLines = (request.OrderItems ?? [])
                .Select(i => (i.ProductId, i.Quantity));
            if (request.OrderItems is null || request.OrderItems.Count == 0)
            {
                stockLines = order.OrderItems.Select(i => (i.ProductId, i.Quantity));
            }

            var stockError = await EnsureSaleStockAvailableAsync(stockLines, cancellationToken);
            if (stockError is not null)
                return (null, stockError);
        }

        order.OrderNumber = request.OrderNumber.Trim();
        order.Direction = request.Direction;
        order.BuyerCompanyId = resolved.BuyerCompanyId;
        order.BuyerCompanyName = resolved.BuyerCompanyName;
        order.SupplierCompanyId = resolved.SupplierCompanyId;
        order.SupplierCompanyName = resolved.SupplierCompanyName;
        order.Status = nextStatus;
        order.OrderDate = NormalizeUtc(request.OrderDate);
        order.DeliveryDate = nextDeliveryDate;
        order.PaymentTerms = request.PaymentTerms;
        order.TaxRate = nextTaxRate;
        order.Notes = nextNotes;

        if (request.OrderItems is { Count: > 0 })
        {
            // Replace lines wholesale — index-based updates can hit missing rows and throw
            // DbUpdateConcurrencyException (500) when the tracked set drifts from the DB.
            var previousLines = order.OrderItems.ToList();
            _dbContext.OrderItems.RemoveRange(previousLines);
            order.OrderItems.Clear();

            foreach (var line in request.OrderItems)
            {
                var (discount, total) = OrderItemPricing.Price(
                    line.Quantity,
                    line.UnitPrice,
                    line.DiscountAmount);
                order.OrderItems.Add(new OrderItem
                {
                    Id = Guid.NewGuid(),
                    OrderId = order.Id,
                    ProductId = line.ProductId,
                    Quantity = line.Quantity,
                    UnitPrice = line.UnitPrice,
                    DiscountAmount = discount,
                    TotalPrice = total
                });
            }
        }

        var subtotal = order.OrderItems.Sum(i => i.TotalPrice);
        order.TotalAmount = ComputeGrandTotal(subtotal, order.TaxRate);

        await AddFieldChangesAsync(
            order.Id,
            OrderFieldHistory.ForEdit(beforeHeader, HeaderFrom(order), beforeLines, afterLines),
            cancellationToken);

        await SyncOrderCountsAsync(
            previousCompanyIds,
            PartyIds(order.BuyerCompanyId, order.SupplierCompanyId),
            cancellationToken);

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return (null, "This order changed while you were editing. Reload and try again.");
        }

        await _auditService.RecordAsync(
            action: "Updated",
            entityType: "Order",
            entityId: order.Id.ToString(),
            entityLabel: order.OrderNumber,
            summary: wasRejected
                ? "Order details updated and resubmitted for approval."
                : "Order details updated.",
            cancellationToken: cancellationToken);

        var updated = await GetByIdAsync(order.Id, cancellationToken);
        return (updated, null);
    }

    public async Task<(OrderResponse? Order, string? Error)> UpdateStatusAsync(
        Guid id,
        OrderStatus status,
        string? rejectionReason = null,
        CancellationToken cancellationToken = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);

        if (order is null)
            return (null, null);

        var transitionError = OrderStateMachine.TransitionError(order.Status, status);
        if (transitionError is not null)
            return (null, transitionError);

        if (order.Status == OrderStatus.Pending && status == OrderStatus.Approved)
        {
            var threshold = await CurrentApprovalThresholdAsync(cancellationToken);
            if (threshold > 0 && order.TotalAmount > threshold && !_tenant.IsOrgAdmin)
            {
                return (null, "This order is above the approval threshold and must be approved by the authorized person.");
            }

            if (_tenant.UserId == order.CreatedByUserId && !_tenant.IsOrgAdmin)
                return (null, "You cannot approve an order you created.");
        }

        var previous = order.Status;
        var previousReason = order.RejectionReason;

        if (previous == OrderStatus.Pending && status == OrderStatus.Rejected)
        {
            var reason = rejectionReason?.Trim();
            if (string.IsNullOrWhiteSpace(reason))
                return (null, "A rejection reason is required.");
            if (reason.Length > 1000)
                return (null, "Rejection reason must be 1000 characters or fewer.");
            order.RejectionReason = reason;
        }

        if (status == OrderStatus.Approved)
            order.RejectionReason = null;

        var stockError = await ApplyStockForStatusChangeAsync(
            order,
            previous,
            status,
            cancellationToken);
        if (stockError is not null)
            return (null, stockError);

        order.Status = status;
        await AddFieldChangesAsync(
            order.Id,
            OrderFieldHistory.ForStatus(previous, status, previousReason, order.RejectionReason),
            cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "StatusChanged",
            entityType: "Order",
            entityId: order.Id.ToString(),
            entityLabel: order.OrderNumber,
            summary: status == OrderStatus.Rejected
                ? $"Status changed from {previous} to {status}: {order.RejectionReason}"
                : $"Status changed from {previous} to {status}.",
            cancellationToken: cancellationToken);

        return (await GetByIdAsync(order.Id, cancellationToken), null);
    }

    private static DateTime NormalizeUtc(DateTime value) =>
        value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };

    private static DateTime? NormalizeOptionalUtc(DateTime? value) =>
        value.HasValue ? NormalizeUtc(value.Value) : null;

    private static decimal NormalizeTaxRate(decimal taxRate) =>
        Math.Clamp(Math.Round(taxRate, 2, MidpointRounding.AwayFromZero), 0m, 100m);

    private static decimal ComputeGrandTotal(decimal subtotal, decimal taxRate) =>
        subtotal + InvoiceMoney.Tax(subtotal, taxRate);

    private async Task<decimal> CurrentApprovalThresholdAsync(CancellationToken cancellationToken)
    {
        if (_tenant.OrganizationId is not { } orgId || orgId == Guid.Empty)
            return 0m;

        return await _dbContext.Organizations
            .AsNoTracking()
            .Where(o => o.Id == orgId)
            .Select(o => o.ApprovalThreshold)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task StampApprovalThresholdAsync(
        IEnumerable<OrderResponse> orders,
        CancellationToken cancellationToken)
    {
        var threshold = await CurrentApprovalThresholdAsync(cancellationToken);
        foreach (var order in orders)
            order.ApprovalThreshold = threshold;
    }

    public async Task<bool> SoftDeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);

        if (order is null)
            return false;

        var orderNumber = order.OrderNumber;

        // Reverse stock if this order already moved inventory (SO shipped/delivered, PO delivered).
        if (IsStockCommitted(order.Direction, order.Status))
        {
            var reverseError = await AdjustProductStockAsync(
                order,
                reverse: true,
                cancellationToken);
            if (reverseError is not null)
                return false;
        }

        order.IsDeleted = true;
        order.DeletedAt = DateTime.UtcNow;
        await AddFieldChangesAsync(order.Id, OrderFieldHistory.ForDelete(order.OrderNumber), cancellationToken);
        foreach (var companyId in PartyIds(order.BuyerCompanyId, order.SupplierCompanyId))
            await AdjustOrderCountAsync(companyId, delta: -1, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Deleted",
            entityType: "Order",
            entityId: id.ToString(),
            entityLabel: orderNumber,
            summary: "Order soft-deleted.",
            cancellationToken: cancellationToken);

        return true;
    }

    private async Task AdjustOrderCountAsync(
        Guid companyId,
        int delta,
        CancellationToken cancellationToken)
    {
        var company = await _dbContext.Companies
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == companyId && !c.IsDeleted, cancellationToken);

        if (company is null)
            return;

        company.OrderCount = Math.Max(0, company.OrderCount + delta);
    }

    /// <summary>
    /// PO increases stock when Delivered. SO decreases stock when Shipped (kept through Delivered).
    /// </summary>
    private static bool IsStockCommitted(OrderDirection direction, OrderStatus status) =>
        direction == OrderDirection.Sale
            ? status is OrderStatus.Shipped or OrderStatus.Delivered
            : status == OrderStatus.Delivered;

    private async Task<string?> ApplyStockForStatusChangeAsync(
        Order order,
        OrderStatus previous,
        OrderStatus next,
        CancellationToken cancellationToken)
    {
        var wasCommitted = IsStockCommitted(order.Direction, previous);
        var willCommit = IsStockCommitted(order.Direction, next);
        if (wasCommitted == willCommit)
            return null;

        return await AdjustProductStockAsync(
            order,
            reverse: wasCommitted && !willCommit,
            cancellationToken);
    }

    private async Task<string?> EnsureSaleStockAvailableAsync(
        IEnumerable<(Guid ProductId, int Quantity)> lines,
        CancellationToken cancellationToken)
    {
        var qtyByProduct = lines
            .GroupBy(l => l.ProductId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));

        if (qtyByProduct.Count == 0)
            return null;

        var productIds = qtyByProduct.Keys.ToList();
        var products = await _dbContext.Products
            .AsNoTracking()
            .Where(p => productIds.Contains(p.Id) && !p.IsDeleted)
            .ToListAsync(cancellationToken);

        if (products.Count != productIds.Count)
            return "One or more products on this order are missing or deleted.";

        foreach (var product in products)
        {
            var qty = qtyByProduct[product.Id];
            if (product.StockQuantity < qty)
            {
                return $"Not enough stock for '{product.Name}'.";
            }
        }

        return null;
    }

    private async Task<string?> AdjustProductStockAsync(
        Order order,
        bool reverse,
        CancellationToken cancellationToken)
    {
        if (order.OrderItems.Count == 0)
            return null;

        var qtyByProduct = order.OrderItems
            .GroupBy(i => i.ProductId)
            .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));

        var productIds = qtyByProduct.Keys.ToList();
        var products = await _dbContext.Products
            .Where(p => productIds.Contains(p.Id) && !p.IsDeleted)
            .ToListAsync(cancellationToken);

        if (products.Count != productIds.Count)
            return "One or more products on this order are missing or deleted.";

        // Sale: decrease on commit, increase on reverse. Purchase: opposite.
        var sign = order.Direction == OrderDirection.Sale ? -1 : 1;
        if (reverse)
            sign *= -1;

        foreach (var product in products)
        {
            var qty = qtyByProduct[product.Id];
            var nextStock = product.StockQuantity + (sign * qty);
            if (nextStock < 0)
            {
                return $"Not enough stock for '{product.Name}'.";
            }

            product.StockQuantity = nextStock;
        }

        return null;
    }

    private async Task<string?> GetOrderNumberConflictAsync(
        string orderNumber,
        Guid? excludeId,
        CancellationToken cancellationToken)
    {
        var normalized = orderNumber.Trim().ToLower();
        var orgId = _tenant.RequireOrganizationId();
        var query = _dbContext.Orders
            .IgnoreQueryFilters()
            .Where(o => !o.IsDeleted && o.OrganizationId == orgId);

        if (excludeId.HasValue)
            query = query.Where(o => o.Id != excludeId.Value);

        return await query.AnyAsync(o => o.OrderNumber.ToLower() == normalized, cancellationToken)
            ? "OrderNumber is already taken."
            : null;
    }

    private readonly record struct OrderParties(
        Guid PartnerCompanyId,
        Guid? BuyerCompanyId,
        string BuyerCompanyName,
        Guid? SupplierCompanyId,
        string SupplierCompanyName);

    private static List<Guid> PartyIds(Guid? buyerCompanyId, Guid? supplierCompanyId)
    {
        var ids = new List<Guid>(2);
        if (buyerCompanyId is Guid buyerId)
            ids.Add(buyerId);
        if (supplierCompanyId is Guid supplierId && supplierId != buyerCompanyId)
            ids.Add(supplierId);
        return ids;
    }

    private async Task SyncOrderCountsAsync(
        IReadOnlyCollection<Guid> previousCompanyIds,
        IReadOnlyCollection<Guid> nextCompanyIds,
        CancellationToken cancellationToken)
    {
        foreach (var companyId in previousCompanyIds.Except(nextCompanyIds))
            await AdjustOrderCountAsync(companyId, delta: -1, cancellationToken);

        foreach (var companyId in nextCompanyIds.Except(previousCompanyIds))
            await AdjustOrderCountAsync(companyId, delta: 1, cancellationToken);
    }

    private async Task<(OrderParties? Parties, string? Error)> ResolvePartiesAsync(
        OrderDirection direction,
        Guid partnerCompanyId,
        Guid createdByUserId,
        IEnumerable<Guid>? productIds,
        CancellationToken cancellationToken)
    {
        var selling = direction == OrderDirection.Sale;
        var partner = await _dbContext.Companies
            .FirstOrDefaultAsync(c => c.Id == partnerCompanyId, cancellationToken);
        if (partner is null)
            return (null, "Partner company does not exist.");
        if (partner.Status != CompanyStatus.Active)
            return (null, "Partner company must be Active.");

        if (selling)
        {
            if (partner.Type is not CompanyType.Buyer and not CompanyType.Both)
                return (null, "Client must be a Buyer or Both company type.");
        }
        else if (partner.Type is not CompanyType.Supplier and not CompanyType.Both)
        {
            return (null, "Vendor must be a Supplier or Both company type.");
        }

        var orgId = _tenant.RequireOrganizationId();
        var organizationName = await _dbContext.Organizations
            .AsNoTracking()
            .Where(o => o.Id == orgId)
            .Select(o => o.Name)
            .FirstOrDefaultAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(organizationName))
            return (null, "Organization not found.");

        var creatorOk = await _dbContext.OrganizationMemberships.AnyAsync(
            m => m.UserId == createdByUserId
                 && m.OrganizationId == orgId
                 && m.Status == MembershipStatus.Active,
            cancellationToken);
        if (!creatorOk)
            return (null, "CreatedByUserId does not exist.");

        if (productIds is not null)
        {
            var ids = productIds.Distinct().ToList();
            var products = await _dbContext.Products
                .Where(p => ids.Contains(p.Id))
                .ToListAsync(cancellationToken);

            if (products.Count != ids.Count)
                return (null, "One or more ProductIds do not exist.");

            if (!selling && products.Any(p => p.CompanyId != partnerCompanyId || !p.IsActive))
                return (null, "Each product must belong to the selected vendor and be active.");

            // SO: sell from your org catalog only (tenant-scoped products), must be active.
            if (selling && products.Any(p => p.OrganizationId != orgId || !p.IsActive))
                return (null, "Each product must be an active product from your organization catalog.");
        }

        return (new OrderParties(
            partner.Id,
            selling ? partner.Id : null,
            selling ? partner.Name : organizationName.Trim(),
            selling ? null : partner.Id,
            selling ? organizationName.Trim() : partner.Name), null);
    }

    public async Task<IReadOnlyList<OrderFieldChangeResponse>?> GetHistoryAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var exists = await _dbContext.Orders.AnyAsync(o => o.Id == id, cancellationToken);
        if (!exists)
            return null;

        var rows = await _dbContext.OrderFieldChanges
            .AsNoTracking()
            .Where(c => c.OrderId == id)
            .OrderByDescending(c => c.CreatedAt)
            .ThenByDescending(c => c.Sequence)
            .Select(c => new OrderFieldChangeResponse
            {
                Id = c.Id,
                ActorName = c.ActorName,
                Field = c.Field,
                OldValue = c.OldValue,
                NewValue = c.NewValue,
                CreatedAt = c.CreatedAt
            })
            .ToListAsync(cancellationToken);

        // Status/creation trail: any viewer. Financial audit (items, terms, discounts): Admin/Finance.
        if (!CanViewFinancialOrderHistory())
        {
            rows = rows
                .Where(c => OrderFieldHistory.IsStatusOrLifecycleField(c.Field))
                .ToList();
        }

        return rows;
    }

    /// <summary>
    /// Org admins and Finance can audit financial field changes.
    /// Operational roles (e.g. ProcurementManager) still see status/creation history only.
    /// </summary>
    private bool CanViewFinancialOrderHistory() =>
        _tenant.IsOrgAdmin || _tenant.Role == UserRole.Finance;

    private async Task AddFieldChangesAsync(
        Guid orderId,
        IReadOnlyList<OrderFieldHistory.Change> changes,
        CancellationToken cancellationToken)
    {
        if (changes.Count == 0)
            return;

        var actorUserId = _tenant.UserId;
        var actorName = "User";
        if (actorUserId is { } userId)
        {
            var name = await _dbContext.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => u.FullName)
                .FirstOrDefaultAsync(cancellationToken);
            if (!string.IsNullOrWhiteSpace(name))
                actorName = name.Trim();
        }

        var now = DateTime.UtcNow;
        for (var i = 0; i < changes.Count; i++)
        {
            var change = changes[i];
            _dbContext.OrderFieldChanges.Add(new OrderFieldChange
            {
                OrganizationId = _tenant.OrganizationId,
                OrderId = orderId,
                ActorUserId = actorUserId,
                ActorName = actorName,
                Field = change.Field,
                OldValue = change.OldValue,
                NewValue = change.NewValue,
                Sequence = i,
                CreatedAt = now
            });
        }
    }

    private async Task<Dictionary<Guid, string>> LoadProductNamesAsync(
        IEnumerable<Guid> productIds,
        CancellationToken cancellationToken)
    {
        var ids = productIds.Distinct().ToList();
        if (ids.Count == 0)
            return new Dictionary<Guid, string>();

        return await _dbContext.Products
            .AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name, cancellationToken);
    }

    private static OrderFieldHistory.HeaderSnap HeaderFrom(Order order) => new(
        order.BuyerCompanyName,
        order.SupplierCompanyName,
        order.DeliveryDate,
        order.PaymentTerms,
        order.TaxRate,
        order.Notes,
        order.Status,
        order.Direction);

    private static IReadOnlyList<OrderFieldHistory.LineSnap> LinesFrom(
        IEnumerable<OrderItem> items,
        IReadOnlyDictionary<Guid, string> productNames) =>
        items.Select(item => new OrderFieldHistory.LineSnap(
            item.ProductId,
            productNames.TryGetValue(item.ProductId, out var name) && !string.IsNullOrWhiteSpace(name)
                ? name.Trim()
                : "Product",
            item.Quantity,
            item.UnitPrice,
            item.DiscountAmount,
            item.TotalPrice)).ToList();

    private async Task<string> CurrentOrgCurrencyAsync(CancellationToken cancellationToken)
    {
        var orgId = _tenant.RequireOrganizationId();
        var currency = await _dbContext.Organizations
            .AsNoTracking()
            .Where(o => o.Id == orgId)
            .Select(o => o.DefaultCurrency)
            .FirstOrDefaultAsync(cancellationToken);
        return string.IsNullOrWhiteSpace(currency) ? "USD" : currency.Trim().ToUpperInvariant();
    }
}
