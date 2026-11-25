using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;
using OrderCraft.Tenancy;

namespace OrderCraft.Services;

public class PermissionService : IPermissionService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ITenantContext _tenant;
    private readonly IAuditService _auditService;

    public PermissionService(
        ApplicationDbContext dbContext,
        ITenantContext tenant,
        IAuditService auditService)
    {
        _dbContext = dbContext;
        _tenant = tenant;
        _auditService = auditService;
    }

    public IReadOnlyList<PageCatalogItemResponse> GetCatalog()
    {
        IEnumerable<AppPages.PageDefinition> pages = AppPages.TenantCatalog;
        if (_tenant.HasOrganization)
        {
            var org = _dbContext.Organizations.AsNoTracking()
                .FirstOrDefault(o => o.Id == _tenant.OrganizationId);
            var enabled = AppPages.ParseEnabledKeys(org?.EnabledPageKeys);
            pages = pages.Where(p => enabled.Contains(p.Key, StringComparer.OrdinalIgnoreCase));
        }

        return pages
            .Select(p => new PageCatalogItemResponse
            {
                Key = p.Key,
                Label = p.Label,
                Description = p.Description,
                Path = p.Path
            })
            .ToList();
    }

    public Task<UserPermissionsResponse?> GetMyPermissionsAsync(
        Guid userId,
        CancellationToken cancellationToken = default) =>
        GetUserPermissionsAsync(userId, _tenant.OrganizationId, cancellationToken);

    public async Task<UserPermissionsResponse?> GetUserPermissionsAsync(
        Guid userId,
        Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var orgId = organizationId ?? _tenant.OrganizationId;
        if (orgId is null)
            return null;

        var membership = await LoadMembershipAsync(userId, orgId.Value, cancellationToken);
        if (membership is null)
            return null;

        var stored = await _dbContext.UserPagePermissions
            .AsNoTracking()
            .Where(p => p.MembershipId == membership.Id)
            .ToListAsync(cancellationToken);

        var org = await _dbContext.Organizations.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == orgId.Value, cancellationToken);
        return BuildResponse(membership, stored, AppPages.ParseEnabledKeys(org?.EnabledPageKeys));
    }

    public async Task<(UserPermissionsResponse? Result, string? Error)> UpdateUserPermissionsAsync(
        Guid userId,
        UpdateUserPermissionsRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (null, "Only organization admins can update permissions.");

        var orgId = _tenant.RequireOrganizationId();
        var membership = await LoadMembershipAsync(userId, orgId, cancellationToken);
        if (membership is null)
            return (null, "User not found.");

        if (membership.Role == UserRole.Admin)
            return (null, "Admin access is always full and cannot be changed.");

        if (membership.UserId == _tenant.UserId)
            return (null, "You cannot change your own membership.");

        var validKeys = AppPages.Catalog.Select(p => p.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var incoming = request.Permissions
            .Where(p => validKeys.Contains(p.PageKey))
            .GroupBy(p => p.PageKey, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.Last())
            .ToList();

        var existing = await _dbContext.UserPagePermissions
            .Where(p => p.MembershipId == membership.Id)
            .ToListAsync(cancellationToken);

        _dbContext.UserPagePermissions.RemoveRange(existing);

        foreach (var page in AppPages.Catalog)
        {
            var level = incoming
                .FirstOrDefault(p => p.PageKey.Equals(page.Key, StringComparison.OrdinalIgnoreCase))
                ?.AccessLevel ?? PageAccessLevel.Hidden;

            if (level == PageAccessLevel.Hidden)
                continue;

            _dbContext.UserPagePermissions.Add(new UserPagePermission
            {
                MembershipId = membership.Id,
                PageKey = page.Key,
                AccessLevel = level
            });
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        var granted = incoming.Count(p => p.AccessLevel != PageAccessLevel.Hidden);
        await _auditService.RecordAsync(
            action: "PermissionsUpdated",
            entityType: "Employee",
            entityId: membership.User.Id.ToString(),
            entityLabel: membership.User.FullName,
            summary: $"Page permissions updated ({granted} page(s) with access).",
            cancellationToken: cancellationToken);

        var stored = await _dbContext.UserPagePermissions
            .AsNoTracking()
            .Where(p => p.MembershipId == membership.Id)
            .ToListAsync(cancellationToken);

        var org = await _dbContext.Organizations.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == orgId, cancellationToken);
        return (BuildResponse(membership, stored, AppPages.ParseEnabledKeys(org?.EnabledPageKeys)), null);
    }

    public async Task<bool> HasAccessAsync(
        Guid userId,
        Guid organizationId,
        string pageKey,
        PageAccessLevel required,
        CancellationToken cancellationToken = default)
    {
        var membership = await LoadMembershipAsync(userId, organizationId, cancellationToken);
        if (membership is null || membership.Status != MembershipStatus.Active)
            return false;

        var org = await _dbContext.Organizations.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == organizationId, cancellationToken);
        if (org is null || !AppPages.OrgAllowsPage(org.EnabledPageKeys, pageKey))
            return false;

        if (membership.Role == UserRole.Admin)
            return true;

        var stored = await _dbContext.UserPagePermissions
            .AsNoTracking()
            .FirstOrDefaultAsync(
                p => p.MembershipId == membership.Id && p.PageKey == pageKey,
                cancellationToken);

        var level = stored?.AccessLevel
            ?? (AppPages.DefaultsForRole(membership.Role).TryGetValue(pageKey, out var fallback)
                ? fallback
                : PageAccessLevel.Hidden);

        return level >= required;
    }

    private async Task<OrganizationMembership?> LoadMembershipAsync(
        Guid userId,
        Guid organizationId,
        CancellationToken cancellationToken)
    {
        return await _dbContext.OrganizationMemberships
            .Include(m => m.User)
            .FirstOrDefaultAsync(
                m => m.UserId == userId
                     && m.OrganizationId == organizationId
                     && m.Status != MembershipStatus.Revoked,
                cancellationToken);
    }

    private static UserPermissionsResponse BuildResponse(
        OrganizationMembership membership,
        IReadOnlyList<UserPagePermission> stored,
        IReadOnlyList<string> enabledPageKeys)
    {
        var isAdmin = membership.Role == UserRole.Admin;
        var map = stored.ToDictionary(
            p => p.PageKey,
            p => p.AccessLevel,
            StringComparer.OrdinalIgnoreCase);

        var defaults = AppPages.DefaultsForRole(membership.Role);
        var enabled = enabledPageKeys.ToHashSet(StringComparer.OrdinalIgnoreCase);

        var permissions = AppPages.TenantCatalog.Select(page =>
        {
            PageAccessLevel level;
            if (!enabled.Contains(page.Key))
            {
                level = PageAccessLevel.Hidden;
            }
            else if (isAdmin)
            {
                level = PageAccessLevel.Edit;
            }
            else if (map.TryGetValue(page.Key, out var storedLevel))
            {
                level = storedLevel;
            }
            else if (stored.Count == 0 && defaults.TryGetValue(page.Key, out var defaultLevel))
            {
                level = defaultLevel;
            }
            else
            {
                level = PageAccessLevel.Hidden;
            }

            return new PagePermissionItem
            {
                PageKey = page.Key,
                AccessLevel = level
            };
        }).ToList();

        return new UserPermissionsResponse
        {
            UserId = membership.UserId,
            FullName = membership.User.FullName,
            Email = membership.User.Email,
            Role = membership.Role,
            IsAdmin = isAdmin,
            Permissions = permissions
        };
    }
}
