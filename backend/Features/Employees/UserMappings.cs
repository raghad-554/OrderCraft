using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public static class UserMappings
{
    public static UserResponse ToResponse(User user, OrganizationMembership? membership = null)
    {
        var privilege = membership?.Role ?? user.Role;
        var orgRole = membership?.OrganizationRole;
        var department = membership?.OrganizationDepartment;
        return new UserResponse
        {
            Id = user.Id,
            Username = user.Username,
            FullName = user.FullName,
            Email = user.Email,
            Role = privilege,
            RoleId = membership?.OrganizationRoleId,
            RoleName = orgRole?.Name ?? RoleLabel(privilege),
            RoleKey = orgRole?.Key ?? privilege.ToString(),
            IsSystemRole = orgRole?.IsSystem ?? privilege == UserRole.Admin,
            PhoneNumber = user.PhoneNumber,
            Department = department?.Name ?? user.Department,
            DepartmentId = membership?.OrganizationDepartmentId,
            CompanyId = user.CompanyId,
            CompanyName = user.Company?.Name,
            IsActive = membership is null
                ? user.IsActive
                : membership.Status == MembershipStatus.Active,
            MembershipId = membership?.Id,
            MembershipStatus = membership?.Status.ToString(),
            LastLoginAt = user.LastLoginAt,
            CreatedAt = user.CreatedAt
        };
    }

    public static LoginUserDto ToLoginDto(
        User user,
        OrganizationMembership? membership = null,
        UserRole? role = null)
    {
        var privilege = membership?.Role ?? role ?? user.Role;
        return new LoginUserDto
        {
            Id = user.Id,
            Username = user.Username,
            FullName = user.FullName,
            Email = user.Email,
            Role = membership?.OrganizationRole?.Key ?? privilege.ToString(),
            Department = membership?.OrganizationDepartment?.Name ?? user.Department
        };
    }

    public static void AssignCatalog(
        OrganizationMembership membership,
        OrganizationRole role,
        OrganizationDepartment? department)
    {
        membership.OrganizationRoleId = role.Id;
        membership.OrganizationRole = role;
        membership.Role = role.PrivilegeRole;
        membership.OrganizationDepartmentId = department?.Id;
        membership.OrganizationDepartment = department;
        if (membership.User is not null)
        {
            membership.User.Role = role.PrivilegeRole;
            membership.User.Department = department?.Name;
        }
    }

    public static void SeedDefaultPermissions(
        ApplicationDbContext db,
        OrganizationMembership membership,
        UserRole privilege,
        string? enabledPageKeys = null)
    {
        foreach (var (key, level) in AppPages.DefaultsForRole(privilege))
        {
            if (level == PageAccessLevel.Hidden && privilege != UserRole.Admin)
                continue;
            if (enabledPageKeys is not null && !AppPages.OrgAllowsPage(enabledPageKeys, key))
                continue;
            db.UserPagePermissions.Add(new UserPagePermission
            {
                MembershipId = membership.Id,
                PageKey = key,
                AccessLevel = privilege == UserRole.Admin ? PageAccessLevel.Edit : level
            });
        }
    }

    public static void SeedPermissionsFromDepartment(
        ApplicationDbContext db,
        OrganizationMembership membership,
        OrganizationDepartment? department,
        string? enabledPageKeys = null)
    {
        if (membership.Role == UserRole.Admin)
        {
            SeedDefaultPermissions(db, membership, UserRole.Admin, enabledPageKeys);
            return;
        }

        var map = (department?.Permissions ?? [])
            .ToDictionary(p => p.PageKey, p => p.AccessLevel, StringComparer.OrdinalIgnoreCase);
        foreach (var page in AppPages.TenantCatalog)
        {
            if (enabledPageKeys is not null && !AppPages.OrgAllowsPage(enabledPageKeys, page.Key))
                continue;
            var level = map.TryGetValue(page.Key, out var value) ? value : PageAccessLevel.Hidden;
            if (level == PageAccessLevel.Hidden)
                continue;
            db.UserPagePermissions.Add(new UserPagePermission
            {
                MembershipId = membership.Id,
                PageKey = page.Key,
                AccessLevel = level
            });
        }
    }

    public static string RoleLabel(UserRole role) =>
        role == UserRole.ProcurementManager ? "Procurement Manager" : role.ToString();
}
