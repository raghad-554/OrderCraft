using OrderCraft.Models;

namespace OrderCraft.Services;

public static class InvoiceRules
{
    public static bool CanInvoice(OrderStatus status, decimal uninvoicedAmount) =>
        uninvoicedAmount > 0m
        && status is OrderStatus.Approved or OrderStatus.Shipped or OrderStatus.Delivered;

    public static string? EligibilityError(Order? order, decimal invoicedAmount)
    {
        if (order is null)
            return "Order not found.";

        if (order.TotalAmount <= 0)
            return "Order total must be greater than 0.";

        if (order.Status is not OrderStatus.Approved
            and not OrderStatus.Shipped
            and not OrderStatus.Delivered)
            return "Only Approved (or later) purchase orders can have an invoice.";

        if (InvoiceMoney.Remaining(order.TotalAmount, invoicedAmount) <= 0m)
            return "This order is already fully invoiced.";

        return null;
    }

    public static string? AmountError(decimal amount, decimal remaining)
    {
        if (InvoiceMoney.Round(amount) <= 0m)
            return "Amount must be greater than 0.";

        if (InvoiceMoney.Round(amount) > remaining)
            return $"Amount cannot be more than the remaining {remaining:0.00}.";

        return null;
    }
}

public static class InvoiceMoney
{
    /// <summary>
    /// USD only. Amounts use two decimal places, half away from zero.
    /// A line discount is taken before tax. Tax is a percentage of that discounted subtotal.
    /// </summary>
    public const string CurrencyCode = "USD";

    public static readonly TimeSpan DuplicatePaymentWindow = TimeSpan.FromMinutes(2);

    public static decimal Round(decimal value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);

    public static decimal Tax(decimal subtotal, decimal taxRate) =>
        Round(subtotal * (taxRate / 100m));

    public static decimal Remaining(decimal orderTotal, decimal invoicedAmount) =>
        Round(orderTotal - invoicedAmount);

    public static decimal Paid(Invoice invoice) =>
        Round(invoice.Payments?.Sum(p => p.Amount) ?? 0m);

    public static decimal Outstanding(Invoice invoice) =>
        Round(invoice.Amount - Paid(invoice));

    public static InvoiceStatus Status(Invoice invoice, DateTime? utcNow = null)
    {
        var today = (utcNow ?? DateTime.UtcNow).Date;
        var paid = Paid(invoice);
        if (paid <= 0m)
            return invoice.DueDate.Date < today ? InvoiceStatus.Overdue : InvoiceStatus.Unpaid;
        if (paid >= invoice.Amount)
            return InvoiceStatus.Paid;
        return InvoiceStatus.PartiallyPaid;
    }

    public static InvoiceStatus? Rollup(IEnumerable<Invoice> invoices, DateTime? utcNow = null)
    {
        var active = invoices.Where(invoice => !invoice.IsDeleted).ToList();
        if (active.Count == 0)
            return null;

        var paid = Round(active.Sum(Paid));
        var outstanding = Round(active.Sum(Outstanding));
        if (outstanding <= 0m)
            return InvoiceStatus.Paid;
        if (paid <= 0m)
            return active.Any(invoice => Status(invoice, utcNow) == InvoiceStatus.Overdue)
                ? InvoiceStatus.Overdue
                : InvoiceStatus.Unpaid;
        return InvoiceStatus.PartiallyPaid;
    }
}
