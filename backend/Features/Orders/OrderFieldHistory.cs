using System.Globalization;
using OrderCraft.Models;

namespace OrderCraft.Services;

internal static class OrderFieldHistory
{
    public readonly record struct HeaderSnap(
        string Buyer,
        string Vendor,
        DateTime? DeliveryDate,
        PaymentTerms? PaymentTerms,
        decimal TaxRate,
        string? Notes,
        OrderStatus Status,
        OrderDirection Direction);

    public readonly record struct LineSnap(
        Guid ProductId,
        string ProductName,
        int Quantity,
        decimal UnitPrice,
        decimal DiscountAmount,
        decimal TotalPrice);

    public readonly record struct Change(string Field, string? OldValue, string? NewValue);

    public static IReadOnlyList<Change> ForCreate(HeaderSnap header, IReadOnlyList<LineSnap> lines)
    {
        var changes = new List<Change>();
        Compare(changes, "Buyer", null, header.Buyer, includeUnchanged: true);
        Compare(changes, "Vendor", null, header.Vendor, includeUnchanged: true);
        Compare(changes, "Direction", null, header.Direction.ToString(), includeUnchanged: true);
        Compare(changes, "Delivery date", null, FormatDate(header.DeliveryDate), includeUnchanged: true);
        Compare(changes, "Payment terms", null, FormatTerms(header.PaymentTerms), includeUnchanged: true);
        Compare(changes, "Tax rate", null, FormatTax(header.TaxRate), includeUnchanged: true);
        Compare(changes, "Notes", null, BlankToNull(header.Notes), includeUnchanged: true);
        foreach (var line in lines)
            AddLine(changes, null, line);
        return changes;
    }

    public static IReadOnlyList<Change> ForEdit(
        HeaderSnap before,
        HeaderSnap after,
        IReadOnlyList<LineSnap> beforeLines,
        IReadOnlyList<LineSnap> afterLines)
    {
        var changes = new List<Change>();
        AddHeader(changes, before, after, includeUnchanged: false);
        DiffLines(changes, beforeLines, afterLines);
        return changes;
    }

    public static IReadOnlyList<Change> ForStatus(
        OrderStatus from,
        OrderStatus to,
        string? oldReason,
        string? newReason)
    {
        var changes = new List<Change>();
        if (from != to)
            changes.Add(new Change("Status", from.ToString(), to.ToString()));

        var previous = BlankToNull(oldReason);
        var next = BlankToNull(newReason);
        if (!string.Equals(previous, next, StringComparison.Ordinal))
            changes.Add(new Change("Rejection reason", previous, next));

        return changes;
    }

    public static IReadOnlyList<Change> ForDelete(string orderNumber) =>
        [new Change("Order", orderNumber, null)];

    private static void AddHeader(List<Change> changes, HeaderSnap before, HeaderSnap after, bool includeUnchanged)
    {
        Compare(changes, "Buyer", before.Buyer, after.Buyer, includeUnchanged);
        Compare(changes, "Vendor", before.Vendor, after.Vendor, includeUnchanged);
        Compare(changes, "Direction", before.Direction.ToString(), after.Direction.ToString(), includeUnchanged);
        Compare(changes, "Delivery date", FormatDate(before.DeliveryDate), FormatDate(after.DeliveryDate), includeUnchanged);
        Compare(changes, "Payment terms", FormatTerms(before.PaymentTerms), FormatTerms(after.PaymentTerms), includeUnchanged);
        Compare(changes, "Tax rate", FormatTax(before.TaxRate), FormatTax(after.TaxRate), includeUnchanged);
        Compare(changes, "Notes", BlankToNull(before.Notes), BlankToNull(after.Notes), includeUnchanged);
        if (!includeUnchanged)
            Compare(changes, "Status", before.Status.ToString(), after.Status.ToString(), includeUnchanged: false);
    }

    private static void DiffLines(List<Change> changes, IReadOnlyList<LineSnap> beforeLines, IReadOnlyList<LineSnap> afterLines)
    {
        var used = new HashSet<int>();
        foreach (var before in beforeLines)
        {
            var match = -1;
            for (var i = 0; i < afterLines.Count; i++)
            {
                if (used.Contains(i) || afterLines[i].ProductId != before.ProductId)
                    continue;
                match = i;
                break;
            }

            if (match < 0)
            {
                AddLine(changes, before, null);
                continue;
            }

            used.Add(match);
            AddLine(changes, before, afterLines[match]);
        }

        for (var i = 0; i < afterLines.Count; i++)
        {
            if (!used.Contains(i))
                AddLine(changes, null, afterLines[i]);
        }
    }

    private static void AddLine(List<Change> changes, LineSnap? before, LineSnap? after)
    {
        var name = after?.ProductName ?? before?.ProductName ?? "Product";
        Compare(changes, $"{name} / Product", before?.ProductName, after?.ProductName, includeUnchanged: before is null || after is null);
        Compare(changes, $"{name} / Quantity", FormatQuantity(before?.Quantity), FormatQuantity(after?.Quantity), includeUnchanged: before is null || after is null);
        Compare(changes, $"{name} / Unit price", FormatMoney(before?.UnitPrice), FormatMoney(after?.UnitPrice), includeUnchanged: before is null || after is null);
        Compare(changes, $"{name} / Discount", FormatMoney(before?.DiscountAmount), FormatMoney(after?.DiscountAmount), includeUnchanged: before is null || after is null);
        Compare(changes, $"{name} / Line total", FormatMoney(before?.TotalPrice), FormatMoney(after?.TotalPrice), includeUnchanged: before is null || after is null);
    }

    private static void Compare(List<Change> changes, string field, string? oldValue, string? newValue, bool includeUnchanged)
    {
        var before = BlankToNull(oldValue);
        var after = BlankToNull(newValue);
        if (!includeUnchanged && string.Equals(before, after, StringComparison.Ordinal))
            return;
        if (includeUnchanged && before is null && after is null)
            return;
        changes.Add(new Change(TrimField(field), before, after));
    }

    private static string TrimField(string field) =>
        field.Length <= 200 ? field : field[..200];

    private static string? BlankToNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? FormatDate(DateTime? value) =>
        value.HasValue ? value.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;

    private static string? FormatTerms(PaymentTerms? terms) => terms switch
    {
        PaymentTerms.Net30 => "Net 30",
        PaymentTerms.Net60 => "Net 60",
        PaymentTerms.Immediate => "Immediate",
        _ => null
    };

    private static string FormatTax(decimal rate) =>
        rate.ToString("0.##", CultureInfo.InvariantCulture) + "%";

    private static string? FormatQuantity(int? quantity) =>
        quantity.HasValue ? quantity.Value.ToString(CultureInfo.InvariantCulture) : null;

    private static string? FormatMoney(decimal? amount) =>
        amount.HasValue ? amount.Value.ToString("0.00", CultureInfo.InvariantCulture) : null;
}
