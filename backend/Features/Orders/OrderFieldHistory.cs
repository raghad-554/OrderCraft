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
        var changes = new List<Change>
        {
            new("Created", null, FormatCreated(header)),
        };

        var terms = FormatTermsLine(header);
        if (terms is not null)
            changes.Add(new Change("Terms", null, terms));

        var notes = BlankToNull(header.Notes);
        if (notes is not null)
            changes.Add(new Change("Notes", null, notes));

        foreach (var line in lines)
            changes.Add(new Change("Item", null, FormatLine(line)));

        return changes;
    }

    public static IReadOnlyList<Change> ForEdit(
        HeaderSnap before,
        HeaderSnap after,
        IReadOnlyList<LineSnap> beforeLines,
        IReadOnlyList<LineSnap> afterLines)
    {
        var changes = new List<Change>();
        AddHeader(changes, before, after);
        DiffLines(changes, beforeLines, afterLines);
        return changes;
    }

    /// <summary>
    /// True when order content changed (ignores status-only transitions such as Rejected → Pending).
    /// </summary>
    public static bool HasContentChanges(
        HeaderSnap before,
        HeaderSnap after,
        IReadOnlyList<LineSnap> beforeLines,
        IReadOnlyList<LineSnap> afterLines,
        string? beforeOrderNumber,
        string? afterOrderNumber)
    {
        if (!string.Equals(
                beforeOrderNumber?.Trim(),
                afterOrderNumber?.Trim(),
                StringComparison.OrdinalIgnoreCase))
            return true;

        var changes = new List<Change>();
        AddHeader(changes, before, after with { Status = before.Status }, includeStatus: false);
        DiffLines(changes, beforeLines, afterLines);
        return changes.Count > 0;
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

    /// <summary>
    /// Lifecycle / status trail visible to anyone who can view the order.
    /// Financial audit fields (Terms, Item, Notes, legacy price rows) are excluded unless elevated.
    /// </summary>
    public static bool IsStatusOrLifecycleField(string? field)
    {
        if (string.IsNullOrWhiteSpace(field))
            return false;

        return field.Equals("Created", StringComparison.OrdinalIgnoreCase)
            || field.Equals("Status", StringComparison.OrdinalIgnoreCase)
            || field.Equals("Rejection reason", StringComparison.OrdinalIgnoreCase)
            || field.Equals("Order", StringComparison.OrdinalIgnoreCase);
    }

    private static void AddHeader(
        List<Change> changes,
        HeaderSnap before,
        HeaderSnap after,
        bool includeStatus = true)
    {
        var beforeCreated = FormatCreated(before);
        var afterCreated = FormatCreated(after);
        if (!string.Equals(beforeCreated, afterCreated, StringComparison.Ordinal))
            changes.Add(new Change("Order", beforeCreated, afterCreated));

        var beforeTerms = FormatTermsLine(before);
        var afterTerms = FormatTermsLine(after);
        if (!string.Equals(beforeTerms, afterTerms, StringComparison.Ordinal))
            changes.Add(new Change("Terms", beforeTerms, afterTerms));

        Compare(changes, "Notes", BlankToNull(before.Notes), BlankToNull(after.Notes));

        if (includeStatus && before.Status != after.Status)
            changes.Add(new Change("Status", before.Status.ToString(), after.Status.ToString()));
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
                changes.Add(new Change("Item", FormatLine(before), null));
                continue;
            }

            used.Add(match);
            var after = afterLines[match];
            var beforeText = FormatLine(before);
            var afterText = FormatLine(after);
            if (!string.Equals(beforeText, afterText, StringComparison.Ordinal))
                changes.Add(new Change("Item", beforeText, afterText));
        }

        for (var i = 0; i < afterLines.Count; i++)
        {
            if (!used.Contains(i))
                changes.Add(new Change("Item", null, FormatLine(afterLines[i])));
        }
    }

    private static string FormatCreated(HeaderSnap header) =>
        header.Direction == OrderDirection.Sale
            ? $"You sell to {BlankToNull(header.Buyer) ?? "client"}"
            : $"You buy from {BlankToNull(header.Vendor) ?? "vendor"}";

    private static string? FormatTermsLine(HeaderSnap header)
    {
        var parts = new List<string>();
        var date = FormatDate(header.DeliveryDate);
        if (date is not null)
            parts.Add(date);
        var terms = FormatTerms(header.PaymentTerms);
        if (terms is not null)
            parts.Add(terms);
        parts.Add($"Tax {FormatTax(header.TaxRate)}");
        return parts.Count == 0 ? null : string.Join(" · ", parts);
    }

    private static string FormatLine(LineSnap line)
    {
        var name = BlankToNull(line.ProductName) ?? "Product";
        var parts = new List<string>
        {
            name,
            $"Qty: {line.Quantity}",
            $"Unit: {FormatMoney(line.UnitPrice)}",
        };
        if (line.DiscountAmount > 0)
            parts.Add($"Discount: {FormatMoney(line.DiscountAmount)}");
        parts.Add($"Total: {FormatMoney(line.TotalPrice)}");

        // ERP-style: labels through Discount, then arrow into Total.
        var head = string.Join(" · ", parts.Take(parts.Count - 1));
        return $"{head} → {parts[^1]}";
    }

    private static void Compare(List<Change> changes, string field, string? oldValue, string? newValue)
    {
        var before = BlankToNull(oldValue);
        var after = BlankToNull(newValue);
        if (string.Equals(before, after, StringComparison.Ordinal))
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

    private static string FormatMoney(decimal amount) =>
        amount.ToString("#,##0.00", CultureInfo.GetCultureInfo("en-US"));
}
