using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public class OrgCatalogService : IOrgCatalogService
{
    private static readonly (string Key, string Name, UserRole Template, bool System, int Sort)[] DefaultRoles =
    [
        (OrganizationRole.AdminKey, "Admin", UserRole.Admin, true, 0),
        ("ProcurementManager", "Procurement Manager", UserRole.ProcurementManager, false, 1),
        ("Finance", "Finance", UserRole.Finance, false, 2),
    ];

    private static readonly (string Name, int Sort)[] DefaultDepartments =
    [
        ("Administration", 0),
        ("Procurement", 1),
        ("Finance", 2),
    ];

    private readonly ApplicationDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IAuditService _audit;

    public OrgCatalogService(ApplicationDbContext db, ITenantContext tenant, IAuditService audit)
    {
        _db = db;
        _tenant = tenant;
        _audit = audit;
    }

    public async Task EnsureDefaultsAsync(Guid organizationId, CancellationToken cancellationToken = default)
    {
        var roles = await _db.OrganizationRoles.IgnoreQueryFilters()
            .Where(r => r.OrganizationId == organizationId)
            .ToListAsync(cancellationToken);
        var roleKeys = roles.Select(r => r.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var spec in DefaultRoles)
        {
            if (roleKeys.Contains(spec.Key))
                continue;
            _db.OrganizationRoles.Add(new OrganizationRole
            {
                OrganizationId = organizationId,
                Key = spec.Key,
                Name = spec.Name,
                Template = spec.Template,
                IsSystem = spec.System,
                IsActive = true,
                SortOrder = spec.Sort,
                CreatedAt = DateTime.UtcNow
            });
        }

        var departments = await _db.OrganizationDepartments.IgnoreQueryFilters()
            .Where(d => d.OrganizationId == organizationId)
            .ToListAsync(cancellationToken);
        var names = departments.Select(d => d.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var spec in DefaultDepartments)
        {
            if (names.Contains(spec.Name))
                continue;
            _db.OrganizationDepartments.Add(new OrganizationDepartment
            {
                OrganizationId = organizationId,
                Name = spec.Name,
                IsActive = true,
                SortOrder = spec.Sort,
                CreatedAt = DateTime.UtcNow
            });
        }

        if (_db.ChangeTracker.HasChanges())
            await _db.SaveChangesAsync(cancellationToken);

        await SeedMissingDepartmentPermissionsAsync(organizationId, cancellationToken);
    }

    private async Task SeedMissingDepartmentPermissionsAsync(
        Guid organizationId,
        CancellationToken cancellationToken)
    {
        var departments = await _db.OrganizationDepartments
            .IgnoreQueryFilters()
            .Include(d => d.Permissions)
            .Where(d => d.OrganizationId == organizationId)
            .ToListAsync(cancellationToken);

        foreach (var department in departments)
        {
            if (department.Permissions.Count > 0)
                continue;
            foreach (var permission in DefaultPermissionsForDepartmentName(department.Name))
            {
                _db.OrganizationDepartmentPermissions.Add(new OrganizationDepartmentPermission
                {
                    DepartmentId = department.Id,
                    PageKey = permission.PageKey,
                    AccessLevel = permission.AccessLevel
                });
            }
        }

        if (_db.ChangeTracker.HasChanges())
            await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<OrganizationRoleResponse>> ListRolesAsync(
        bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        var orgId = _tenant.RequireOrganizationId();
        await EnsureDefaultsAsync(orgId, cancellationToken);
        var query = _db.OrganizationRoles.AsNoTracking().Where(r => r.OrganizationId == orgId);
        if (!includeInactive)
            query = query.Where(r => r.IsActive);

        var rows = await query
            .OrderBy(r => r.SortOrder)
            .ThenBy(r => r.Name)
            .Select(r => new OrganizationRoleResponse
            {
                Id = r.Id,
                Key = r.Key,
                Name = r.Name,
                Template = r.Template,
                IsSystem = r.IsSystem,
                IsActive = r.IsActive,
                SortOrder = r.SortOrder,
                MemberCount = r.Memberships.Count(m => m.Status != MembershipStatus.Revoked)
            })
            .ToListAsync(cancellationToken);
        return rows;
    }

    public async Task<IReadOnlyList<OrganizationDepartmentResponse>> ListDepartmentsAsync(
        bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        var orgId = _tenant.RequireOrganizationId();
        await EnsureDefaultsAsync(orgId, cancellationToken);
        var query = _db.OrganizationDepartments.AsNoTracking().Where(d => d.OrganizationId == orgId);
        if (!includeInactive)
            query = query.Where(d => d.IsActive);

        return await query
            .OrderBy(d => d.SortOrder)
            .ThenBy(d => d.Name)
            .Select(d => new OrganizationDepartmentResponse
            {
                Id = d.Id,
                Name = d.Name,
                IsActive = d.IsActive,
                SortOrder = d.SortOrder,
                MemberCount = d.Memberships.Count(m => m.Status != MembershipStatus.Revoked),
                Permissions = d.Permissions
                    .Select(p => new PagePermissionItem
                    {
                        PageKey = p.PageKey,
                        AccessLevel = p.AccessLevel
                    })
                    .ToList()
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<(OrganizationRoleResponse? Role, string? Error)> CreateRoleAsync(
        UpsertOrganizationRoleRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (null, "Only organization admins can manage roles.");

        var orgId = _tenant.RequireOrganizationId();
        await EnsureDefaultsAsync(orgId, cancellationToken);
        var name = request.Name.Trim();
        if (await _db.OrganizationRoles.AnyAsync(
                r => r.OrganizationId == orgId && r.Name.ToLower() == name.ToLower(),
                cancellationToken))
            return (null, "A role with that name already exists.");

        var key = UniqueKey(orgId, name);
        if (string.Equals(key, OrganizationRole.AdminKey, StringComparison.OrdinalIgnoreCase))
            return (null, "Admin is a system role and cannot be created again.");

        var maxSort = await _db.OrganizationRoles
            .Where(r => r.OrganizationId == orgId)
            .Select(r => (int?)r.SortOrder)
            .MaxAsync(cancellationToken) ?? 0;

        var template = request.Template == UserRole.Admin
            ? UserRole.ProcurementManager
            : request.Template;
        var role = new OrganizationRole
        {
            OrganizationId = orgId,
            Key = key,
            Name = name,
            Template = template,
            IsSystem = false,
            IsActive = request.IsActive,
            SortOrder = maxSort + 1,
            CreatedAt = DateTime.UtcNow
        };
        _db.OrganizationRoles.Add(role);
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.RecordAsync(
            action: "Created",
            entityType: "Role",
            entityId: role.Id.ToString(),
            entityLabel: role.Name,
            summary: $"Organization role created ({role.Name}).",
            cancellationToken: cancellationToken);
        return (ToRoleResponse(role, 0), null);
    }

    public async Task<(OrganizationRoleResponse? Role, string? Error)> UpdateRoleAsync(
        Guid id,
        UpsertOrganizationRoleRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (null, "Only organization admins can manage roles.");

        var orgId = _tenant.RequireOrganizationId();
        var role = await _db.OrganizationRoles
            .FirstOrDefaultAsync(r => r.Id == id && r.OrganizationId == orgId, cancellationToken);
        if (role is null)
            return (null, "Role not found.");

        var name = request.Name.Trim();
        if (await _db.OrganizationRoles.AnyAsync(
                r => r.OrganizationId == orgId && r.Id != id && r.Name.ToLower() == name.ToLower(),
                cancellationToken))
            return (null, "A role with that name already exists.");

        if (role.IsSystem)
        {
            role.Name = name;
        }
        else
        {
            role.Name = name;
            role.Template = request.Template == UserRole.Admin
                ? UserRole.ProcurementManager
                : request.Template;
            role.IsActive = request.IsActive;
        }

        await _db.SaveChangesAsync(cancellationToken);
        var count = await _db.OrganizationMemberships.CountAsync(
            m => m.OrganizationRoleId == role.Id && m.Status != MembershipStatus.Revoked,
            cancellationToken);
        await _audit.RecordAsync(
            action: "Updated",
            entityType: "Role",
            entityId: role.Id.ToString(),
            entityLabel: role.Name,
            summary: $"Organization role updated ({role.Name}).",
            cancellationToken: cancellationToken);
        return (ToRoleResponse(role, count), null);
    }

    public async Task<(bool Ok, string? Error)> DeleteRoleAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (false, "Only organization admins can manage roles.");

        var orgId = _tenant.RequireOrganizationId();
        var role = await _db.OrganizationRoles
            .FirstOrDefaultAsync(r => r.Id == id && r.OrganizationId == orgId, cancellationToken);
        if (role is null)
            return (false, "Role not found.");
        if (role.IsSystem)
            return (false, "The Admin role cannot be removed.");

        var assigned = await _db.OrganizationMemberships.AnyAsync(
            m => m.OrganizationRoleId == id && m.Status != MembershipStatus.Revoked,
            cancellationToken);
        if (assigned)
            return (false, "Reassign employees before removing this role.");

        _db.OrganizationRoles.Remove(role);
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.RecordAsync(
            action: "Deleted",
            entityType: "Role",
            entityId: id.ToString(),
            entityLabel: role.Name,
            summary: $"Organization role removed ({role.Name}).",
            cancellationToken: cancellationToken);
        return (true, null);
    }

    public async Task<(OrganizationDepartmentResponse? Department, string? Error)> CreateDepartmentAsync(
        UpsertOrganizationDepartmentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (null, "Only organization admins can manage departments.");

        var orgId = _tenant.RequireOrganizationId();
        await EnsureDefaultsAsync(orgId, cancellationToken);
        var name = request.Name.Trim();
        if (await _db.OrganizationDepartments.AnyAsync(
                d => d.OrganizationId == orgId && d.Name.ToLower() == name.ToLower(),
                cancellationToken))
            return (null, "A department with that name already exists.");

        var maxSort = await _db.OrganizationDepartments
            .Where(d => d.OrganizationId == orgId)
            .Select(d => (int?)d.SortOrder)
            .MaxAsync(cancellationToken) ?? 0;

        var department = new OrganizationDepartment
        {
            OrganizationId = orgId,
            Name = name,
            IsActive = request.IsActive,
            SortOrder = maxSort + 1,
            CreatedAt = DateTime.UtcNow
        };
        foreach (var permission in NormalizePermissions(request.Permissions, name))
            department.Permissions.Add(permission);
        _db.OrganizationDepartments.Add(department);
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.RecordAsync(
            action: "Created",
            entityType: "Department",
            entityId: department.Id.ToString(),
            entityLabel: department.Name,
            summary: $"Department created ({department.Name}).",
            cancellationToken: cancellationToken);
        return (ToDepartmentResponse(department, 0), null);
    }

    public async Task<(OrganizationDepartmentResponse? Department, string? Error)> UpdateDepartmentAsync(
        Guid id,
        UpsertOrganizationDepartmentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (null, "Only organization admins can manage departments.");

        var orgId = _tenant.RequireOrganizationId();
        var department = await _db.OrganizationDepartments
            .Include(d => d.Permissions)
            .FirstOrDefaultAsync(d => d.Id == id && d.OrganizationId == orgId, cancellationToken);
        if (department is null)
            return (null, "Department not found.");

        var name = request.Name.Trim();
        if (await _db.OrganizationDepartments.AnyAsync(
                d => d.OrganizationId == orgId && d.Id != id && d.Name.ToLower() == name.ToLower(),
                cancellationToken))
            return (null, "A department with that name already exists.");

        if (department.IsActive && !request.IsActive)
        {
            var assigned = await _db.OrganizationMemberships.AnyAsync(
                m => m.OrganizationDepartmentId == id && m.Status != MembershipStatus.Revoked,
                cancellationToken);
            if (assigned)
                return (null, "Reassign employees before deactivating this department.");
        }

        department.Name = name;
        department.IsActive = request.IsActive;
        var previous = department.Permissions.ToList();
        if (previous.Count > 0)
            _db.OrganizationDepartmentPermissions.RemoveRange(previous);
        department.Permissions.Clear();
        foreach (var permission in NormalizePermissions(request.Permissions, name))
        {
            permission.DepartmentId = department.Id;
            _db.OrganizationDepartmentPermissions.Add(permission);
        }
        await _db.SaveChangesAsync(cancellationToken);
        var count = await _db.OrganizationMemberships.CountAsync(
            m => m.OrganizationDepartmentId == department.Id && m.Status != MembershipStatus.Revoked,
            cancellationToken);
        await _audit.RecordAsync(
            action: "Updated",
            entityType: "Department",
            entityId: department.Id.ToString(),
            entityLabel: department.Name,
            summary: $"Department updated ({department.Name}).",
            cancellationToken: cancellationToken);
        return (ToDepartmentResponse(department, count), null);
    }

    public async Task<(bool Ok, string? Error)> DeleteDepartmentAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (false, "Only organization admins can manage departments.");

        var orgId = _tenant.RequireOrganizationId();
        var department = await _db.OrganizationDepartments
            .FirstOrDefaultAsync(d => d.Id == id && d.OrganizationId == orgId, cancellationToken);
        if (department is null)
            return (false, "Department not found.");

        var assigned = await _db.OrganizationMemberships.AnyAsync(
            m => m.OrganizationDepartmentId == id && m.Status != MembershipStatus.Revoked,
            cancellationToken);
        if (assigned)
            return (false, "Reassign employees before removing this department.");

        _db.OrganizationDepartments.Remove(department);
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.RecordAsync(
            action: "Deleted",
            entityType: "Department",
            entityId: id.ToString(),
            entityLabel: department.Name,
            summary: $"Department removed ({department.Name}).",
            cancellationToken: cancellationToken);
        return (true, null);
    }

    public Task<OrganizationRole?> GetRoleAsync(
        Guid organizationId,
        Guid roleId,
        CancellationToken cancellationToken = default) =>
        _db.OrganizationRoles.IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.Id == roleId && r.OrganizationId == organizationId, cancellationToken);

    public Task<OrganizationDepartment?> GetDepartmentAsync(
        Guid organizationId,
        Guid departmentId,
        CancellationToken cancellationToken = default) =>
        _db.OrganizationDepartments.IgnoreQueryFilters()
            .Include(d => d.Permissions)
            .FirstOrDefaultAsync(d => d.Id == departmentId && d.OrganizationId == organizationId, cancellationToken);

    public async Task<OrganizationRole> RequireRoleAsync(
        Guid organizationId,
        UserRole privilege,
        CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(organizationId, cancellationToken);
        var key = privilege == UserRole.Admin
            ? OrganizationRole.AdminKey
            : privilege.ToString();
        var role = await _db.OrganizationRoles.IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.OrganizationId == organizationId && r.Key == key, cancellationToken);
        if (role is not null)
            return role;

        var fallback = await _db.OrganizationRoles.IgnoreQueryFilters()
            .FirstAsync(
                r => r.OrganizationId == organizationId && r.Key == OrganizationRole.AdminKey,
                cancellationToken);
        return fallback;
    }

    private string UniqueKey(Guid organizationId, string name)
    {
        var slug = Regex.Replace(name.Trim(), @"[^A-Za-z0-9]+", "");
        if (string.IsNullOrWhiteSpace(slug))
            slug = "Role";
        if (slug.Length > 60)
            slug = slug[..60];
        var key = slug;
        var n = 2;
        while (_db.OrganizationRoles.IgnoreQueryFilters().Any(r =>
                   r.OrganizationId == organizationId && r.Key.ToLower() == key.ToLower()))
        {
            key = $"{slug}{n++}";
        }
        return key;
    }

    private static OrganizationRoleResponse ToRoleResponse(OrganizationRole role, int memberCount) => new()
    {
        Id = role.Id,
        Key = role.Key,
        Name = role.Name,
        Template = role.Template,
        IsSystem = role.IsSystem,
        IsActive = role.IsActive,
        SortOrder = role.SortOrder,
        MemberCount = memberCount
    };

    private static OrganizationDepartmentResponse ToDepartmentResponse(
        OrganizationDepartment department,
        int memberCount) => new()
    {
        Id = department.Id,
        Name = department.Name,
        IsActive = department.IsActive,
        SortOrder = department.SortOrder,
        MemberCount = memberCount,
        Permissions = department.Permissions
            .Select(p => new PagePermissionItem
            {
                PageKey = p.PageKey,
                AccessLevel = p.AccessLevel
            })
            .ToList()
    };

    private static List<OrganizationDepartmentPermission> NormalizePermissions(
        IEnumerable<PagePermissionItem>? requested,
        string departmentName)
    {
        var source = (requested ?? []).Where(p => !string.IsNullOrWhiteSpace(p.PageKey)).ToList();
        if (source.Count == 0)
            return DefaultPermissionsForDepartmentName(departmentName)
                .Select(p => new OrganizationDepartmentPermission
                {
                    PageKey = p.PageKey,
                    AccessLevel = p.AccessLevel
                })
                .ToList();

        var map = source
            .GroupBy(p => p.PageKey.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Last().AccessLevel, StringComparer.OrdinalIgnoreCase);

        return AppPages.TenantCatalog
            .Select(page => new OrganizationDepartmentPermission
            {
                PageKey = page.Key,
                AccessLevel = map.TryGetValue(page.Key, out var level) ? level : PageAccessLevel.Hidden
            })
            .ToList();
    }

    private static List<PagePermissionItem> DefaultPermissionsForDepartmentName(string name)
    {
        var template = name.Equals("Administration", StringComparison.OrdinalIgnoreCase)
            ? UserRole.Admin
            : name.Equals("Finance", StringComparison.OrdinalIgnoreCase)
                ? UserRole.Finance
                : UserRole.ProcurementManager;
        return AppPages.TenantCatalog
            .Select(page => new PagePermissionItem
            {
                PageKey = page.Key,
                AccessLevel = AppPages.DefaultsForRole(template).TryGetValue(page.Key, out var level)
                    ? level
                    : PageAccessLevel.Hidden
            })
            .ToList();
    }
}
