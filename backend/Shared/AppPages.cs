using OrderCraft.Models;

namespace OrderCraft.Services;

public static class AppPages
{
    public sealed record PageDefinition(
        string Key,
        string Label,
        string Description,
        string Path);

    public static readonly IReadOnlyList<PageDefinition> Catalog =
    [
        new("dashboard", "Dashboard", "Admin home and overview.", "/admin"),
        new("companies", "Companies", "Clients and vendors directory.", "/admin/companies"),
        new("products", "Products", "Vendor product catalog for purchase orders.", "/admin/products"),
        new("employees", "Employees", "Create employee accounts and access.", "/admin/employees"),
        new("roles", "Roles & Permissions", "Decide page access for each user.", "/admin/employees/roles"),
        new("purchaseOrders", "Purchase orders", "Create and manage purchase orders.", "/admin/purchase-orders"),
        new("invoices", "Invoices", "Billing and invoice tracking.", "/admin/invoices"),
        new("auditLog", "Audit log", "Employee activity monitoring.", "/admin/audit-log"),
        new("settings", "Settings", "Platform configuration.", "/admin/settings"),
        new("featureRegistry", "Feature registry", "High-level platform features.", "/admin/feature-registry"),
    ];

    public static readonly IReadOnlyList<PageDefinition> TenantCatalog =
        Catalog.Where(p => p.Key != "featureRegistry").ToList();

    public static IReadOnlyList<string> DefaultEnabledKeys =>
        TenantCatalog.Select(p => p.Key).ToList();

    public static string SerializeEnabledKeys(IEnumerable<string>? keys)
    {
        var allowed = DefaultEnabledKeys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var selected = (keys ?? DefaultEnabledKeys)
            .Where(k => !string.IsNullOrWhiteSpace(k) && allowed.Contains(k.Trim()))
            .Select(k => k.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (selected.Count == 0)
            selected = DefaultEnabledKeys.ToList();
        return string.Join(",", selected);
    }

    public static IReadOnlyList<string> ParseEnabledKeys(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return DefaultEnabledKeys;

        var allowed = DefaultEnabledKeys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var parsed = raw
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(allowed.Contains)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return parsed.Count == 0 ? DefaultEnabledKeys : parsed;
    }

    public static bool OrgAllowsPage(string? raw, string pageKey) =>
        ParseEnabledKeys(raw).Contains(pageKey, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyDictionary<string, PageAccessLevel> DefaultsForRole(UserRole role) =>
        role switch
        {
            UserRole.Admin => Catalog.ToDictionary(p => p.Key, _ => PageAccessLevel.Edit),
            UserRole.ProcurementManager => new Dictionary<string, PageAccessLevel>
            {
                ["dashboard"] = PageAccessLevel.View,
                ["companies"] = PageAccessLevel.Edit,
                ["products"] = PageAccessLevel.Edit,
                ["employees"] = PageAccessLevel.Hidden,
                ["roles"] = PageAccessLevel.Hidden,
                ["purchaseOrders"] = PageAccessLevel.Edit,
                ["invoices"] = PageAccessLevel.View,
                ["auditLog"] = PageAccessLevel.Hidden,
                ["settings"] = PageAccessLevel.Hidden,
                ["featureRegistry"] = PageAccessLevel.Hidden,
            },
            UserRole.Finance => new Dictionary<string, PageAccessLevel>
            {
                ["dashboard"] = PageAccessLevel.View,
                ["companies"] = PageAccessLevel.View,
                ["products"] = PageAccessLevel.View,
                ["employees"] = PageAccessLevel.Hidden,
                ["roles"] = PageAccessLevel.Hidden,
                ["purchaseOrders"] = PageAccessLevel.View,
                ["invoices"] = PageAccessLevel.Edit,
                ["auditLog"] = PageAccessLevel.Hidden,
                ["settings"] = PageAccessLevel.Hidden,
                ["featureRegistry"] = PageAccessLevel.Hidden,
            },
            _ => Catalog.ToDictionary(p => p.Key, _ => PageAccessLevel.Hidden)
        };
}
