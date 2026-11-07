using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public static class ProcurementMappings
{
    public static CompanyResponse ToResponse(Company company) => new()
    {
        Id = company.Id,
        Name = company.Name,
        Email = company.Email,
        Phone = company.Phone,
        Address = company.Address,
        TaxNumber = company.TaxNumber,
        Type = company.Type,
        CategoryId = company.CategoryId,
        CategoryName = company.Category?.Name,
        CreditLimit = company.CreditLimit,
        PaymentTerm = company.PaymentTerm,
        DiscountRate = company.DiscountRate,
        OrderCount = company.OrderCount,
        TotalSpend = company.TotalSpend,
        TotalSales = company.TotalSales,
        OutstandingBalance = company.OutstandingBalance,
        PerformanceScore = company.PerformanceScore,
        Status = company.Status,
        CreatedAt = company.CreatedAt
    };

    public static CategoryResponse ToResponse(Category category) => new()
    {
        Id = category.Id,
        Name = category.Name,
        Description = category.Description
    };

    public static ProductResponse ToResponse(Product product) => new()
    {
        Id = product.Id,
        CompanyId = product.CompanyId,
        CompanyName = product.Company?.Name,
        CategoryId = product.CategoryId,
        CategoryName = product.Category?.Name,
        Name = product.Name,
        Description = product.Description,
        SKU = product.SKU,
        Price = product.Price,
        StockQuantity = product.StockQuantity,
        IsActive = product.IsActive
    };

    public static OrderItemResponse ToResponse(OrderItem item) => new()
    {
        Id = item.Id,
        ProductId = item.ProductId,
        ProductName = item.Product?.Name,
        ProductSku = item.Product?.SKU,
        Quantity = item.Quantity,
        UnitPrice = item.UnitPrice,
        DiscountAmount = item.DiscountAmount,
        TotalPrice = item.TotalPrice
    };

    public static OrderResponse ToResponse(Order order)
    {
        var subtotal = order.OrderItems.Sum(i => i.TotalPrice);
        var discountTotal = order.OrderItems.Sum(i => i.DiscountAmount);
        var taxAmount = InvoiceMoney.Tax(subtotal, order.TaxRate);
        var invoices = order.Invoices.Where(invoice => !invoice.IsDeleted).ToList();
        var invoiced = InvoiceMoney.Round(invoices.Sum(invoice => invoice.Amount));
        var latest = invoices
            .OrderByDescending(invoice => invoice.DueDate)
            .ThenByDescending(invoice => invoice.InvoiceNumber)
            .FirstOrDefault();

        return new OrderResponse
        {
            Id = order.Id,
            OrderNumber = order.OrderNumber,
            Direction = order.Direction,
            PartnerCompanyId = order.Direction == OrderDirection.Sale
                ? order.BuyerCompanyId
                : order.SupplierCompanyId,
            BuyerCompanyId = order.BuyerCompanyId,
            BuyerCompanyName = SnapshotName(order.BuyerCompanyName, order.BuyerCompany?.Name),
            SupplierCompanyId = order.SupplierCompanyId,
            SupplierCompanyName = SnapshotName(order.SupplierCompanyName, order.SupplierCompany?.Name),
            CreatedByUserId = order.CreatedByUserId,
            Status = order.Status,
            TotalAmount = order.TotalAmount,
            TaxRate = order.TaxRate,
            TaxAmount = taxAmount,
            SubtotalAmount = subtotal,
            DiscountTotal = discountTotal,
            OrderDate = order.OrderDate,
            DeliveryDate = order.DeliveryDate,
            PaymentTerms = order.PaymentTerms,
            Notes = order.Notes,
            RejectionReason = order.RejectionReason,
            InvoiceId = latest?.Id,
            InvoiceNumber = latest?.InvoiceNumber,
            InvoicedAmount = invoiced,
            UninvoicedAmount = InvoiceMoney.Remaining(order.TotalAmount, invoiced),
            PaymentStatus = InvoiceMoney.Rollup(invoices),
            OrderItems = order.OrderItems
                .Select(ToResponse)
                .ToList()
        };
    }

    private static string? SnapshotName(string? stored, string? live) =>
        !string.IsNullOrWhiteSpace(stored) ? stored : live;

    public static InvoiceResponse ToResponse(Invoice invoice) => new()
    {
        Id = invoice.Id,
        OrderId = invoice.OrderId,
        OrderNumber = invoice.Order?.OrderNumber,
        BuyerCompanyName = SnapshotName(
            invoice.Order?.BuyerCompanyName,
            invoice.Order?.BuyerCompany?.Name),
        SupplierCompanyName = SnapshotName(
            invoice.Order?.SupplierCompanyName,
            invoice.Order?.SupplierCompany?.Name),
        InvoiceNumber = invoice.InvoiceNumber,
        Currency = string.IsNullOrWhiteSpace(invoice.Currency) ? InvoiceMoney.CurrencyCode : invoice.Currency,
        Amount = invoice.Amount,
        AmountPaid = InvoiceMoney.Paid(invoice),
        Outstanding = InvoiceMoney.Outstanding(invoice),
        Status = InvoiceMoney.Status(invoice),
        DueDate = invoice.DueDate
    };
}
