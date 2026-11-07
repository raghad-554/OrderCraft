using Microsoft.EntityFrameworkCore;
using OrderCraft.Auth;
using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public class OrganizationService : IOrganizationService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ITenantContext _tenant;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IPermissionService _permissionService;
    private readonly IAuditService _auditService;
    private readonly IPasswordService _passwordService;
    private readonly IOrgCatalogService _catalog;

    public OrganizationService(
        ApplicationDbContext dbContext,
        ITenantContext tenant,
        IJwtTokenService jwtTokenService,
        IPermissionService permissionService,
        IAuditService auditService,
        IPasswordService passwordService,
        IOrgCatalogService catalog)
    {
        _dbContext = dbContext;
        _tenant = tenant;
        _jwtTokenService = jwtTokenService;
        _permissionService = permissionService;
        _auditService = auditService;
        _passwordService = passwordService;
        _catalog = catalog;
    }

    public async Task<IReadOnlyList<OrganizationSummary>> ListMineAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var rows = await _dbContext.OrganizationMemberships
            .AsNoTracking()
            .Include(m => m.Organization)
            .Where(m => m.UserId == userId && m.Status == MembershipStatus.Active && m.Organization.IsActive)
            .OrderBy(m => m.Organization.Name)
            .ToListAsync(cancellationToken);

        return rows.Select(m => ToSummary(m)).ToList();
    }

    public Task<(OrganizationSummary? Org, string? Error)> CreateAsync(
        Guid userId,
        CreateOrganizationRequest request,
        CancellationToken cancellationToken = default)
    {
        _ = (userId, request, cancellationToken);
        return Task.FromResult<(OrganizationSummary?, string?)>(
            (null, "Only the platform administrator can create organizations."));
    }

    public async Task<(SwitchOrganizationResponse? Result, string? Error)> SwitchAsync(
        Guid userId,
        Guid organizationId,
        string password,
        CancellationToken cancellationToken = default)
    {
        var membership = await _dbContext.OrganizationMemberships
            .Include(m => m.Organization)
            .Include(m => m.User)
            .Include(m => m.OrganizationRole)
            .FirstOrDefaultAsync(
                m => m.UserId == userId && m.OrganizationId == organizationId,
                cancellationToken);

        if (membership is null || membership.Organization is null || membership.User is null)
            return (null, "Organization not found.");

        if (membership.Status != MembershipStatus.Active || !membership.Organization.IsActive)
            return (null, "Organization access is not active.");

        var hash = string.IsNullOrWhiteSpace(membership.PasswordHash)
            ? membership.User.PasswordHash
            : membership.PasswordHash;
        if (!_passwordService.VerifyPassword(hash, password))
            return (null, "Password for this organization is incorrect.");

        return (await BuildSwitchResponseAsync(membership, cancellationToken), null);
    }

    public async Task<(UserResponse? Member, string? Error)> AddExistingMemberAsync(
        AddExistingMemberRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (null, "Only organization admins can add members.");

        var orgId = _tenant.RequireOrganizationId();
        await _catalog.EnsureDefaultsAsync(orgId, cancellationToken);
        var department = await _catalog.GetDepartmentAsync(orgId, request.DepartmentId, cancellationToken);
        if (department is null || !department.IsActive)
            return (null, "Department not found.");
        if (request.IsOrgAdmin && !_tenant.IsOrgAdmin)
            return (null, "Only organization admins can assign the admin role.");
        var role = await _catalog.RequireRoleAsync(
            orgId,
            request.IsOrgAdmin ? UserRole.Admin : UserRole.ProcurementManager,
            cancellationToken);

        var identifier = request.UsernameOrEmail.Trim().ToLowerInvariant();
        var user = await _dbContext.Users
            .FirstOrDefaultAsync(
                u => !u.IsDeleted && (u.Username.ToLower() == identifier || u.Email.ToLower() == identifier),
                cancellationToken);

        if (user is null)
            return (null, "No account found with that username or email. Create a new employee instead.");

        if (user.IsPlatformAdmin)
            return (null, "The platform administrator cannot join an organization.");

        if (user.Id == _tenant.UserId)
            return (null, "You already belong to this organization.");

        var existing = await _dbContext.OrganizationMemberships
            .FirstOrDefaultAsync(
                m => m.OrganizationId == orgId && m.UserId == user.Id,
                cancellationToken);

        if (existing is { Status: MembershipStatus.Active })
            return (null, "That person already belongs to this organization.");

        var passwordHash = existing is not null && !string.IsNullOrWhiteSpace(existing.PasswordHash)
            ? existing.PasswordHash
            : await CopyExistingPasswordHashAsync(user, orgId, cancellationToken);
        if (string.IsNullOrWhiteSpace(passwordHash))
            return (null, "That account has no password to copy. Create a new employee instead.");

        OrganizationMembership membership;
        if (existing is not null)
        {
            existing.Status = MembershipStatus.Active;
            existing.PasswordHash = passwordHash;
            existing.User = user;
            UserMappings.AssignCatalog(existing, role, department);
            var previous = await _dbContext.UserPagePermissions
                .Where(p => p.MembershipId == existing.Id)
                .ToListAsync(cancellationToken);
            _dbContext.UserPagePermissions.RemoveRange(previous);
            UserMappings.SeedPermissionsFromDepartment(_dbContext, existing, department);
            membership = existing;
        }
        else
        {
            membership = new OrganizationMembership
            {
                OrganizationId = orgId,
                UserId = user.Id,
                Status = MembershipStatus.Active,
                PasswordHash = passwordHash,
                CreatedAt = DateTime.UtcNow,
                User = user
            };
            UserMappings.AssignCatalog(membership, role, department);
            _dbContext.OrganizationMemberships.Add(membership);
            UserMappings.SeedPermissionsFromDepartment(_dbContext, membership, department);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Created",
            entityType: "Employee",
            entityId: user.Id.ToString(),
            entityLabel: user.FullName,
            summary: $"Added existing member {user.FullName} ({user.Username}) to {department.Name}. They keep their current password. Other organizations were not changed.",
            cancellationToken: cancellationToken);

        return (UserMappings.ToResponse(user, membership), null);
    }

    public async Task<(bool Ok, string? Error)> SetMembershipStatusAsync(
        Guid membershipId,
        MembershipStatus status,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (false, "Only organization admins can change membership.");

        var orgId = _tenant.RequireOrganizationId();
        var membership = await _dbContext.OrganizationMemberships
            .Include(m => m.User)
            .FirstOrDefaultAsync(m => m.Id == membershipId && m.OrganizationId == orgId, cancellationToken);

        if (membership is null)
            return (false, "Member not found.");

        if (membership.UserId == _tenant.UserId)
            return (false, "You cannot change your own membership.");

        if (status == MembershipStatus.Revoked && membership.Role == UserRole.Admin)
        {
            var otherAdmins = await _dbContext.OrganizationMemberships.CountAsync(
                m => m.OrganizationId == orgId
                     && m.Id != membership.Id
                     && m.Role == UserRole.Admin
                     && m.Status == MembershipStatus.Active,
                cancellationToken);
            if (otherAdmins == 0)
                return (false, "Cannot revoke the last organization admin.");
        }

        membership.Status = status;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: status == MembershipStatus.Active ? "Activated" : status == MembershipStatus.Suspended ? "Deactivated" : "Deleted",
            entityType: "Employee",
            entityId: membership.UserId.ToString(),
            entityLabel: membership.User.FullName,
            summary: $"Membership {status.ToString().ToLowerInvariant()}.",
            cancellationToken: cancellationToken);

        return (true, null);
    }

    private async Task<string?> CopyExistingPasswordHashAsync(
        User user,
        Guid excludeOrganizationId,
        CancellationToken cancellationToken)
    {
        var source = await _dbContext.OrganizationMemberships
            .Where(m =>
                m.UserId == user.Id
                && m.OrganizationId != excludeOrganizationId
                && m.PasswordHash != "")
            .OrderByDescending(m => m.Status == MembershipStatus.Active)
            .ThenByDescending(m => m.CreatedAt)
            .Select(m => m.PasswordHash)
            .FirstOrDefaultAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(source))
            return source;

        return string.IsNullOrWhiteSpace(user.PasswordHash) ? null : user.PasswordHash;
    }

    private async Task<SwitchOrganizationResponse> BuildSwitchResponseAsync(
        OrganizationMembership membership,
        CancellationToken cancellationToken)
    {
        var (token, expiresAt) = _jwtTokenService.CreateToken(membership.User, membership);
        var permissions = await _permissionService.GetUserPermissionsAsync(
            membership.UserId,
            membership.OrganizationId,
            cancellationToken);

        var enabled = AppPages.ParseEnabledKeys(membership.Organization.EnabledPageKeys).ToList();
        var summary = ToSummary(membership);
        summary.EnabledPageKeys = enabled;
        return new SwitchOrganizationResponse
        {
            Token = token,
            ExpiresAt = expiresAt,
            Organization = summary,
            Permissions = permissions?.Permissions ?? [],
            User = UserMappings.ToLoginDto(membership.User, membership),
            EnabledPageKeys = enabled
        };
    }

    public async Task<OrganizationSettingsResponse?> GetSettingsAsync(CancellationToken cancellationToken = default)
    {
        var orgId = _tenant.OrganizationId;
        if (orgId is null)
            return null;

        var threshold = await _dbContext.Organizations
            .AsNoTracking()
            .Where(o => o.Id == orgId)
            .Select(o => (decimal?)o.ApprovalThreshold)
            .FirstOrDefaultAsync(cancellationToken);

        return threshold is null
            ? null
            : new OrganizationSettingsResponse { ApprovalThreshold = threshold.Value };
    }

    public async Task<(OrganizationSettingsResponse? Settings, string? Error)> UpdateSettingsAsync(
        UpdateOrganizationSettingsRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (null, "Only an organization admin can change the approval threshold.");

        var orgId = _tenant.RequireOrganizationId();
        var org = await _dbContext.Organizations
            .FirstOrDefaultAsync(o => o.Id == orgId, cancellationToken);
        if (org is null)
            return (null, "Organization not found.");

        org.ApprovalThreshold = Math.Round(request.ApprovalThreshold, 2, MidpointRounding.AwayFromZero);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Updated",
            entityType: "Organization",
            entityId: org.Id.ToString(),
            entityLabel: org.Name,
            summary: $"Approval threshold set to {org.ApprovalThreshold:0.00}.",
            cancellationToken: cancellationToken);

        return (new OrganizationSettingsResponse { ApprovalThreshold = org.ApprovalThreshold }, null);
    }

    private static OrganizationSummary ToSummary(OrganizationMembership membership, Organization? org = null)
    {
        var source = org ?? membership.Organization;
        return new OrganizationSummary
        {
            Id = membership.OrganizationId,
            Name = source.Name,
            Slug = source.Slug,
            MembershipId = membership.Id,
            Role = membership.Role,
            Status = membership.Status,
            EnabledPageKeys = AppPages.ParseEnabledKeys(source.EnabledPageKeys).ToList()
        };
    }
}
