using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public class UserService : IUserService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IPasswordService _passwordService;
    private readonly IAuditService _auditService;
    private readonly ITenantContext _tenant;
    private readonly IOrgCatalogService _catalog;

    public UserService(
        ApplicationDbContext dbContext,
        IPasswordService passwordService,
        IAuditService auditService,
        ITenantContext tenant,
        IOrgCatalogService catalog)
    {
        _dbContext = dbContext;
        _passwordService = passwordService;
        _auditService = auditService;
        _tenant = tenant;
        _catalog = catalog;
    }

    public async Task<IReadOnlyList<UserResponse>> GetAllAsync(
        string? name = null,
        CancellationToken cancellationToken = default)
    {
        var orgId = _tenant.RequireOrganizationId();
        var query = _dbContext.OrganizationMemberships
            .AsNoTracking()
            .Include(m => m.User)
                .ThenInclude(u => u.Company)
            .Include(m => m.OrganizationRole)
            .Include(m => m.OrganizationDepartment)
            .Where(m => m.OrganizationId == orgId && m.Status != MembershipStatus.Revoked);

        if (!string.IsNullOrWhiteSpace(name))
        {
            var term = $"%{name.Trim()}%";
            query = query.Where(m =>
                EF.Functions.ILike(m.User.FullName, term) ||
                EF.Functions.ILike(m.User.Username, term) ||
                EF.Functions.ILike(m.User.Email, term));
        }

        var rows = await query
            .OrderBy(m => m.User.FullName)
            .ToListAsync(cancellationToken);

        return rows.Select(m => UserMappings.ToResponse(m.User, m)).ToList();
    }

    public async Task<UserResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var membership = await FindMembershipAsync(id, cancellationToken);
        return membership is null ? null : UserMappings.ToResponse(membership.User, membership);
    }

    public async Task<IReadOnlyList<UserResponse>> SearchByNameAsync(
        string name,
        CancellationToken cancellationToken = default)
    {
        return await GetAllAsync(name, cancellationToken);
    }

    public async Task<(UserResponse? User, string? ConflictMessage)> CreateAsync(
        CreateUserRequest request,
        CancellationToken cancellationToken = default)
    {
        var conflict = await ValidateWritableAsync(request, excludeUserId: null, cancellationToken);
        if (conflict is not null)
            return (null, conflict);

        var resolved = await ResolveCatalogAsync(request, currentRoleId: null, currentDepartmentId: null, cancellationToken);
        if (resolved.Error is not null)
            return (null, resolved.Error);

        var user = new User
        {
            PasswordHash = _passwordService.HashPassword(request.Password),
            CreatedAt = DateTime.UtcNow,
            IsDeleted = false,
            IsActive = request.IsActive
        };

        ApplyWritableFields(user, request);
        user.Role = resolved.Role.PrivilegeRole;
        user.Department = resolved.Department?.Name;
        _dbContext.Users.Add(user);

        var membership = new OrganizationMembership
        {
            OrganizationId = _tenant.RequireOrganizationId(),
            UserId = user.Id,
            Status = request.IsActive ? MembershipStatus.Active : MembershipStatus.Suspended,
            PasswordHash = user.PasswordHash,
            CreatedAt = DateTime.UtcNow,
            User = user
        };
        UserMappings.AssignCatalog(membership, resolved.Role, resolved.Department);
        _dbContext.OrganizationMemberships.Add(membership);
        UserMappings.SeedPermissionsFromDepartment(_dbContext, membership, resolved.Department);

        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Created",
            entityType: "Employee",
            entityId: user.Id.ToString(),
            entityLabel: user.FullName,
            summary: $"Employee account created" +
                     (resolved.Department is null ? "." : $" ({resolved.Department.Name})."),
            cancellationToken: cancellationToken);

        await _dbContext.Entry(user).Reference(u => u.Company).LoadAsync(cancellationToken);
        return (UserMappings.ToResponse(user, membership), null);
    }

    public async Task<(UserResponse? User, string? ConflictMessage)> UpdateAsync(
        Guid id,
        UpdateUserRequest request,
        CancellationToken cancellationToken = default)
    {
        var membership = await FindMembershipAsync(id, cancellationToken, tracking: true);
        if (membership is null)
            return (null, null);

        var resolved = await ResolveCatalogAsync(
            request,
            membership.OrganizationRoleId,
            membership.OrganizationDepartmentId,
            cancellationToken);
        if (resolved.Error is not null)
            return (null, resolved.Error);

        if (membership.UserId == _tenant.UserId && membership.OrganizationRoleId != resolved.Role.Id)
            return (null, "You cannot change your own admin access.");

        if (resolved.Role.IsSystemAdmin && !_tenant.IsOrgAdmin)
            return (null, "Only organization admins can assign the admin role.");

        if (membership.Role == UserRole.Admin && resolved.Role.PrivilegeRole != UserRole.Admin)
        {
            var lastAdminError = await LastAdminMessageAsync(membership, cancellationToken);
            if (lastAdminError is not null)
                return (null, lastAdminError);
        }

        var user = membership.User;
        await _dbContext.Entry(user).Reference(u => u.Company).LoadAsync(cancellationToken);

        var conflict = await ValidateWritableAsync(request, excludeUserId: id, cancellationToken);
        if (conflict is not null)
            return (null, conflict);

        ApplyWritableFields(user, request);
        var roleChanged = membership.OrganizationRoleId != resolved.Role.Id;
        var departmentChanged = membership.OrganizationDepartmentId != resolved.Department?.Id;
        UserMappings.AssignCatalog(membership, resolved.Role, resolved.Department);
        membership.Status = request.IsActive ? MembershipStatus.Active : MembershipStatus.Suspended;

        if (roleChanged || departmentChanged)
        {
            var previous = await _dbContext.UserPagePermissions
                .Where(p => p.MembershipId == membership.Id)
                .ToListAsync(cancellationToken);
            _dbContext.UserPagePermissions.RemoveRange(previous);
            UserMappings.SeedPermissionsFromDepartment(_dbContext, membership, resolved.Department);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Updated",
            entityType: "Employee",
            entityId: user.Id.ToString(),
            entityLabel: user.FullName,
            summary: $"Employee profile updated" +
                     (resolved.Department is null ? "" : $" ({resolved.Department.Name})") +
                     (user.IsActive ? ", active" : ", inactive") + ".",
            cancellationToken: cancellationToken);

        return (UserMappings.ToResponse(user, membership), null);
    }

    public async Task<bool> SetActiveAsync(Guid id, bool isActive, CancellationToken cancellationToken = default)
    {
        var membership = await FindMembershipAsync(id, cancellationToken, tracking: true);
        if (membership is null)
            return false;

        if (membership.UserId == _tenant.UserId)
            return false;

        membership.Status = isActive ? MembershipStatus.Active : MembershipStatus.Suspended;
        var user = membership.User;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: isActive ? "Activated" : "Deactivated",
            entityType: "Employee",
            entityId: user.Id.ToString(),
            entityLabel: user.FullName,
            summary: isActive
                ? "Employee account activated."
                : "Employee account deactivated.",
            cancellationToken: cancellationToken);

        return true;
    }

    public async Task<(ResetPasswordResponse? Result, string? ErrorMessage)> ResetPasswordAsync(
        Guid id,
        ResetPasswordRequest request,
        CancellationToken cancellationToken = default)
    {
        var membership = await FindMembershipAsync(id, cancellationToken, tracking: true);
        if (membership is null)
            return (null, "User not found.");

        var user = membership.User;
        var newPassword = request.NewPassword?.Trim() ?? "";
        if (newPassword.Length < 6)
            return (null, "Enter a password of at least 6 characters.");

        membership.PasswordHash = _passwordService.HashPassword(newPassword);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "PasswordReset",
            entityType: "Employee",
            entityId: user.Id.ToString(),
            entityLabel: user.FullName,
            summary: "Password was reset for this organization only. Other organizations were not changed.",
            cancellationToken: cancellationToken);

        return (new ResetPasswordResponse
        {
            UserId = user.Id
        }, null);
    }

    public async Task<bool> SoftDeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var membership = await FindMembershipAsync(id, cancellationToken, tracking: true);
        if (membership is null)
            return false;

        if (membership.UserId == _tenant.UserId)
            return false;

        if (membership.Role == UserRole.Admin)
        {
            var lastAdminError = await LastAdminMessageAsync(membership, cancellationToken);
            if (lastAdminError is not null)
                return false;
        }

        var label = membership.User.FullName;
        membership.Status = MembershipStatus.Revoked;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Deleted",
            entityType: "Employee",
            entityId: id.ToString(),
            entityLabel: label,
            summary: "Employee account soft-deleted.",
            cancellationToken: cancellationToken);

        return true;
    }

    private async Task<OrganizationMembership?> FindMembershipAsync(
        Guid userId,
        CancellationToken cancellationToken,
        bool tracking = false)
    {
        var orgId = _tenant.RequireOrganizationId();
        var query = tracking
            ? _dbContext.OrganizationMemberships
                .Include(m => m.User)
                .Include(m => m.OrganizationRole)
                .Include(m => m.OrganizationDepartment)
                    .ThenInclude(d => d!.Permissions)
                .AsQueryable()
            : _dbContext.OrganizationMemberships.AsNoTracking()
                .Include(m => m.User).ThenInclude(u => u.Company)
                .Include(m => m.OrganizationRole)
                .Include(m => m.OrganizationDepartment)
                    .ThenInclude(d => d!.Permissions);

        return await query.FirstOrDefaultAsync(
            m => m.OrganizationId == orgId && m.UserId == userId && m.Status != MembershipStatus.Revoked,
            cancellationToken);
    }

    private static void ApplyWritableFields(User user, UserRequestBase request)
    {
        user.Username = request.Username.Trim();
        user.FullName = request.FullName.Trim();
        user.Email = request.Email.Trim();
        user.PhoneNumber = request.PhoneNumber.Trim();
        user.CompanyId = request.CompanyId;
        user.IsActive = request.IsActive;
    }

    private async Task<(OrganizationRole Role, OrganizationDepartment? Department, string? Error)> ResolveCatalogAsync(
        UserRequestBase request,
        Guid? currentRoleId,
        Guid? currentDepartmentId,
        CancellationToken cancellationToken)
    {
        var orgId = _tenant.RequireOrganizationId();
        await _catalog.EnsureDefaultsAsync(orgId, cancellationToken);

        if (request.DepartmentId is not Guid departmentId || departmentId == Guid.Empty)
            return (null!, null, "Department is required.");

        var department = await _catalog.GetDepartmentAsync(orgId, departmentId, cancellationToken);
        if (department is null)
            return (null!, null, "Department not found.");
        if (!department.IsActive && department.Id != currentDepartmentId)
            return (null!, null, "That department is inactive.");

        var wantAdmin = request.IsOrgAdmin;
        if (!wantAdmin && request.RoleId is Guid requestedRoleId && requestedRoleId != Guid.Empty)
        {
            var requested = await _catalog.GetRoleAsync(orgId, requestedRoleId, cancellationToken);
            wantAdmin = requested?.IsSystemAdmin == true;
        }

        if (wantAdmin && !_tenant.IsOrgAdmin)
            return (null!, null, "Only organization admins can assign the admin role.");

        var role = await _catalog.RequireRoleAsync(
            orgId,
            wantAdmin ? UserRole.Admin : UserRole.ProcurementManager,
            cancellationToken);
        if (!role.IsActive && role.Id != currentRoleId)
            return (null!, null, "That role is inactive.");

        return (role, department, null);
    }

    private async Task<string?> LastAdminMessageAsync(
        OrganizationMembership membership,
        CancellationToken cancellationToken)
    {
        var orgId = _tenant.RequireOrganizationId();
        var otherAdmins = await _dbContext.OrganizationMemberships.CountAsync(
            m => m.OrganizationId == orgId
                 && m.Id != membership.Id
                 && m.Role == UserRole.Admin
                 && m.Status == MembershipStatus.Active,
            cancellationToken);
        return otherAdmins == 0 ? "Cannot remove the last organization admin." : null;
    }

    private async Task<string?> ValidateWritableAsync(
        UserRequestBase request,
        Guid? excludeUserId,
        CancellationToken cancellationToken)
    {
        var username = request.Username.Trim();
        var email = request.Email.Trim();

        var conflict = await GetConflictMessageAsync(username, email, excludeUserId, cancellationToken);
        if (conflict is not null)
            return conflict;

        if (!request.CompanyId.HasValue)
            return null;

        var companyExists = await _dbContext.Companies
            .AnyAsync(c => c.Id == request.CompanyId.Value, cancellationToken);

        return companyExists ? null : "CompanyId does not exist.";
    }

    private async Task<string?> GetConflictMessageAsync(
        string username,
        string email,
        Guid? excludeUserId,
        CancellationToken cancellationToken)
    {
        var query = _dbContext.Users.IgnoreQueryFilters().Where(u => !u.IsDeleted);

        if (excludeUserId.HasValue)
            query = query.Where(u => u.Id != excludeUserId.Value);

        if (await query.AnyAsync(u => u.Username.ToLower() == username.ToLower(), cancellationToken))
            return "Username is already taken. Use Add existing member to include that person in this organization.";

        if (await query.AnyAsync(u => u.Email.ToLower() == email.ToLower(), cancellationToken))
            return "Email is already taken. Use Add existing member to include that person in this organization.";

        return null;
    }
}
