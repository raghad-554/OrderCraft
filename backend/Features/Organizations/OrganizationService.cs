using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using OrderCraft.Auth.Jwt;
using OrderCraft.Models;
using OrderCraft.Schemas;
using OrderCraft.Tenancy;

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
        bool rememberMe = false,
        CancellationToken cancellationToken = default)
    {
        var membership = await _dbContext.OrganizationMemberships
            .Include(m => m.Organization)
            .Include(m => m.User)
            .Include(m => m.OrganizationRole)
            .Include(m => m.OrganizationDepartment)
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

    public async Task<(InvitationResponse? Invitation, string? Error)> CreateInvitationAsync(
        CreateInvitationRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (null, "Only organization admins can invite members.");

        var orgId = _tenant.RequireOrganizationId();
        await _catalog.EnsureDefaultsAsync(orgId, cancellationToken);
        var department = await _catalog.GetDepartmentAsync(orgId, request.DepartmentId, cancellationToken);
        if (department is null || !department.IsActive)
            return (null, "Department not found.");

        if (request.IsOrgAdmin && !_tenant.IsOrgAdmin)
            return (null, "Only organization admins can assign the admin role.");

        var email = request.Email.Trim().ToLowerInvariant();
        var alreadyMember = await _dbContext.OrganizationMemberships
            .AnyAsync(
                m => m.OrganizationId == orgId
                     && m.Status == MembershipStatus.Active
                     && m.User.Email.ToLower() == email,
                cancellationToken);
        if (alreadyMember)
            return (null, "That email already belongs to this organization.");

        var pending = await _dbContext.OrganizationInvitations
            .FirstOrDefaultAsync(
                i => i.OrganizationId == orgId
                     && i.Email == email
                     && i.Status == InvitationStatus.Pending,
                cancellationToken);
        if (pending is not null)
            return (null, "A pending invitation already exists for that email.");

        var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var invitation = new OrganizationInvitation
        {
            OrganizationId = orgId,
            Email = email,
            OrganizationDepartmentId = department.Id,
            IsOrgAdmin = request.IsOrgAdmin,
            Status = InvitationStatus.Pending,
            TokenHash = HashInviteToken(rawToken),
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            InvitedByUserId = _tenant.UserId ?? Guid.Empty,
            CreatedAt = DateTime.UtcNow,
            OrganizationDepartment = department
        };

        _dbContext.OrganizationInvitations.Add(invitation);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Created",
            entityType: "Invitation",
            entityId: invitation.Id.ToString(),
            entityLabel: email,
            summary: $"Invited {email} to {department.Name}.",
            cancellationToken: cancellationToken);

        return (ToInvitationResponse(invitation, department.Name, rawToken), null);
    }

    public async Task<IReadOnlyList<InvitationResponse>> ListInvitationsAsync(
        CancellationToken cancellationToken = default)
    {
        var orgId = _tenant.RequireOrganizationId();
        var now = DateTime.UtcNow;
        var rows = await _dbContext.OrganizationInvitations
            .Include(i => i.OrganizationDepartment)
            .Where(i => i.OrganizationId == orgId)
            .OrderByDescending(i => i.CreatedAt)
            .Take(100)
            .ToListAsync(cancellationToken);

        foreach (var row in rows.Where(i =>
                     i.Status == InvitationStatus.Pending && i.ExpiresAt < now))
        {
            row.Status = InvitationStatus.Expired;
        }

        if (_dbContext.ChangeTracker.HasChanges())
            await _dbContext.SaveChangesAsync(cancellationToken);

        return rows
            .Select(i => ToInvitationResponse(i, i.OrganizationDepartment?.Name ?? "", acceptToken: null))
            .ToList();
    }

    public async Task<(bool Ok, string? Error)> RevokeInvitationAsync(
        Guid invitationId,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (false, "Only organization admins can revoke invitations.");

        var orgId = _tenant.RequireOrganizationId();
        var invitation = await _dbContext.OrganizationInvitations
            .FirstOrDefaultAsync(
                i => i.Id == invitationId && i.OrganizationId == orgId,
                cancellationToken);

        if (invitation is null)
            return (false, "Invitation not found.");

        if (invitation.Status is not InvitationStatus.Pending)
            return (false, "Only pending invitations can be revoked.");

        invitation.Status = InvitationStatus.Revoked;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Deleted",
            entityType: "Invitation",
            entityId: invitation.Id.ToString(),
            entityLabel: invitation.Email,
            summary: $"Revoked invitation for {invitation.Email}.",
            cancellationToken: cancellationToken);

        return (true, null);
    }

    public async Task<(UserResponse? Member, string? Error)> AcceptInvitationAsync(
        AcceptInvitationRequest request,
        Guid? actingUserId,
        CancellationToken cancellationToken = default)
    {
        var token = request.Token.Trim();
        if (string.IsNullOrWhiteSpace(token))
            return (null, "Invitation token is required.");

        var tokenHash = HashInviteToken(token);
        // Accept runs without org tenant context — bypass org query filter.
        var invitation = await _dbContext.OrganizationInvitations
            .IgnoreQueryFilters()
            .Include(i => i.OrganizationDepartment)
            .Include(i => i.Organization)
            .FirstOrDefaultAsync(i => i.TokenHash == tokenHash, cancellationToken);

        if (invitation is null)
            return (null, "Invitation not found.");

        if (invitation.Status == InvitationStatus.Revoked)
            return (null, "This invitation was revoked.");

        if (invitation.Status == InvitationStatus.Accepted)
            return (null, "This invitation was already accepted.");

        if (invitation.ExpiresAt < DateTime.UtcNow || invitation.Status == InvitationStatus.Expired)
        {
            invitation.Status = InvitationStatus.Expired;
            await _dbContext.SaveChangesAsync(cancellationToken);
            return (null, "This invitation has expired.");
        }

        if (invitation.Organization is null || !invitation.Organization.IsActive)
            return (null, "Organization is not active.");

        var department = invitation.OrganizationDepartment
            ?? await _catalog.GetDepartmentAsync(
                invitation.OrganizationId,
                invitation.OrganizationDepartmentId,
                cancellationToken);
        if (department is null || !department.IsActive)
            return (null, "Department not found.");

        await _catalog.EnsureDefaultsAsync(invitation.OrganizationId, cancellationToken);
        var role = await _catalog.RequireRoleAsync(
            invitation.OrganizationId,
            invitation.IsOrgAdmin ? UserRole.Admin : UserRole.ProcurementManager,
            cancellationToken);

        var email = invitation.Email.Trim().ToLowerInvariant();
        var user = await _dbContext.Users
            .FirstOrDefaultAsync(
                u => !u.IsDeleted && u.Email.ToLower() == email,
                cancellationToken);

        if (user is null)
        {
            var username = request.Username?.Trim() ?? "";
            var fullName = request.FullName?.Trim() ?? "";
            var password = request.Password ?? "";
            if (string.IsNullOrWhiteSpace(username)
                || string.IsNullOrWhiteSpace(fullName)
                || string.IsNullOrWhiteSpace(password))
            {
                return (null, "Create an account to accept this invitation: username, full name, and password are required.");
            }

            if (password.Length < 6)
                return (null, "Password must be at least 6 characters.");

            var usernameTaken = await _dbContext.Users.AnyAsync(
                u => !u.IsDeleted && u.Username.ToLower() == username.ToLower(),
                cancellationToken);
            if (usernameTaken)
                return (null, "Username is already taken.");

            user = new User
            {
                Username = username,
                FullName = fullName,
                Email = email,
                PasswordHash = _passwordService.HashPassword(password),
                Role = role.PrivilegeRole,
                Department = department.Name,
                IsActive = true,
                IsDeleted = false,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.Users.Add(user);
        }
        else
        {
            if (user.IsPlatformAdmin)
                return (null, "The platform administrator cannot join an organization.");

            if (actingUserId is null || actingUserId.Value != user.Id)
                return (null, "Sign in with the invited email account to accept this invitation.");
        }

        var existing = await _dbContext.OrganizationMemberships
            .FirstOrDefaultAsync(
                m => m.OrganizationId == invitation.OrganizationId && m.UserId == user.Id,
                cancellationToken);

        if (existing is { Status: MembershipStatus.Active })
        {
            invitation.Status = InvitationStatus.Accepted;
            await _dbContext.SaveChangesAsync(cancellationToken);
            return (null, "You already belong to this organization.");
        }

        var passwordHash = existing is not null && !string.IsNullOrWhiteSpace(existing.PasswordHash)
            ? existing.PasswordHash
            : !string.IsNullOrWhiteSpace(user.PasswordHash)
                ? user.PasswordHash
                : await CopyExistingPasswordHashAsync(user, invitation.OrganizationId, cancellationToken);

        if (string.IsNullOrWhiteSpace(passwordHash))
            return (null, "Could not establish a password for this membership.");

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
                OrganizationId = invitation.OrganizationId,
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

        invitation.Status = InvitationStatus.Accepted;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Created",
            entityType: "Employee",
            entityId: user.Id.ToString(),
            entityLabel: user.FullName,
            summary: $"Accepted invitation for {user.Email} into {department.Name}.",
            cancellationToken: cancellationToken);

        return (UserMappings.ToResponse(user, membership), null);
    }

    private static string HashInviteToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token.Trim()));
        return Convert.ToHexString(bytes);
    }

    private static InvitationResponse ToInvitationResponse(
        OrganizationInvitation invitation,
        string departmentName,
        string? acceptToken) =>
        new()
        {
            Id = invitation.Id,
            Email = invitation.Email,
            DepartmentId = invitation.OrganizationDepartmentId,
            DepartmentName = departmentName,
            IsOrgAdmin = invitation.IsOrgAdmin,
            Status = invitation.Status,
            ExpiresAt = invitation.ExpiresAt,
            CreatedAt = invitation.CreatedAt,
            InvitedByUserId = invitation.InvitedByUserId,
            AcceptToken = acceptToken
        };

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

        var org = await _dbContext.Organizations
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == orgId, cancellationToken);

        return org is null ? null : ToSettingsResponse(org);
    }

    public async Task<(OrganizationSettingsResponse? Settings, string? Error)> UpdateSettingsAsync(
        UpdateOrganizationSettingsRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_tenant.IsOrgAdmin)
            return (null, "Only an organization admin can change organization settings.");

        var orgId = _tenant.RequireOrganizationId();
        var org = await _dbContext.Organizations
            .FirstOrDefaultAsync(o => o.Id == orgId, cancellationToken);
        if (org is null)
            return (null, "Organization not found.");

        org.Name = request.Name.Trim();
        org.ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail)
            ? null
            : request.ContactEmail.Trim();
        org.ContactPhone = string.IsNullOrWhiteSpace(request.ContactPhone)
            ? null
            : request.ContactPhone.Trim();
        org.LogoUrl = string.IsNullOrWhiteSpace(request.LogoUrl)
            ? null
            : request.LogoUrl.Trim();
        org.DefaultCurrency = request.DefaultCurrency.Trim().ToUpperInvariant();
        org.DefaultTaxRate = Math.Round(request.DefaultTaxRate, 2, MidpointRounding.AwayFromZero);
        org.DefaultPaymentTerms = request.DefaultPaymentTerms;
        org.ApprovalThreshold = Math.Round(request.ApprovalThreshold, 2, MidpointRounding.AwayFromZero);

        await _dbContext.SaveChangesAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "Updated",
            entityType: "Organization",
            entityId: org.Id.ToString(),
            entityLabel: org.Name,
            summary:
                $"Updated organization settings (threshold {org.ApprovalThreshold:0.00}, tax {org.DefaultTaxRate:0.##}%, {org.DefaultCurrency}, {org.DefaultPaymentTerms}).",
            cancellationToken: cancellationToken);

        return (ToSettingsResponse(org), null);
    }

    private static OrganizationSettingsResponse ToSettingsResponse(Organization org) =>
        new()
        {
            Name = org.Name,
            Slug = org.Slug,
            ContactEmail = org.ContactEmail,
            ContactPhone = org.ContactPhone,
            LogoUrl = org.LogoUrl,
            DefaultCurrency = org.DefaultCurrency,
            DefaultTaxRate = org.DefaultTaxRate,
            DefaultPaymentTerms = org.DefaultPaymentTerms,
            ApprovalThreshold = org.ApprovalThreshold
        };

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
