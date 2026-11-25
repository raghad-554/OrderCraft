using Microsoft.EntityFrameworkCore;
using OrderCraft.Auth.Jwt;
using OrderCraft.Auth.Revocation;
using OrderCraft.Models;
using OrderCraft.Schemas;
using OrderCraft.Tenancy;

namespace OrderCraft.Services;

public class AuthService : IAuthService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IPasswordService _passwordService;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IPermissionService _permissionService;
    private readonly IOrganizationService _organizationService;
    private readonly IAuditService _auditService;
    private readonly ITenantContext _tenant;
    private readonly ITokenRevocationService _tokenRevocation;

    public AuthService(
        ApplicationDbContext dbContext,
        IPasswordService passwordService,
        IJwtTokenService jwtTokenService,
        IPermissionService permissionService,
        IOrganizationService organizationService,
        IAuditService auditService,
        ITenantContext tenant,
        ITokenRevocationService tokenRevocation)
    {
        _dbContext = dbContext;
        _passwordService = passwordService;
        _jwtTokenService = jwtTokenService;
        _permissionService = permissionService;
        _organizationService = organizationService;
        _auditService = auditService;
        _tenant = tenant;
        _tokenRevocation = tokenRevocation;
    }

    public async Task LogoutAsync(CancellationToken cancellationToken = default)
    {
        await _tokenRevocation.RevokeCurrentAsync(cancellationToken);

        if (_tenant.UserId is Guid userId)
        {
            var name = await _dbContext.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => u.FullName)
                .FirstOrDefaultAsync(cancellationToken);

            await _auditService.RecordAsync(
                action: "Logout",
                entityType: "Employee",
                entityId: userId.ToString(),
                entityLabel: name ?? "User",
                summary: "Signed out; session token revoked.",
                actorUserId: userId,
                actorName: name,
                cancellationToken: cancellationToken);
        }
    }

    public async Task<LoginResponse?> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken = default)
    {
        var identifier = request.Username.Trim().ToLower();

        var user = await _dbContext.Users
            .FirstOrDefaultAsync(
                u => u.Username.ToLower() == identifier || u.Email.ToLower() == identifier,
                cancellationToken);

        if (user is null || !user.IsActive)
            return null;

        _tenant.SetUser(user.Id);

        if (user.IsPlatformAdmin)
        {
            if (!_passwordService.VerifyPassword(user.PasswordHash, request.Password))
                return null;

            user.LastLoginAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);

            _tenant.SetPlatformAdmin();
            await _auditService.RecordAsync(
                action: "Login",
                entityType: "Employee",
                entityId: user.Id.ToString(),
                entityLabel: user.FullName,
                summary: $"{user.FullName} ({user.Username}) signed in to the platform.",
                actorUserId: user.Id,
                actorName: user.FullName,
                cancellationToken: cancellationToken);

            var (platformToken, platformExpires) = _jwtTokenService.CreateToken(user);
            return new LoginResponse
            {
                Token = platformToken,
                ExpiresAt = platformExpires,
                User = UserMappings.ToLoginDto(user),
                Permissions = [],
                IsPlatformAdmin = true,
                EnabledPageKeys = []
            };
        }

        var memberships = await _dbContext.OrganizationMemberships
            .IgnoreQueryFilters()
            .Include(m => m.Organization)
            .Include(m => m.OrganizationRole)
            .Include(m => m.OrganizationDepartment)
            .Where(m =>
                m.UserId == user.Id
                && m.Status == MembershipStatus.Active
                && m.Organization.IsActive)
            .OrderBy(m => m.Organization.Name)
            .ToListAsync(cancellationToken);

        var matching = memberships
            .Where(m => MatchesOrgPassword(m, user, request.Password))
            .ToList();
        if (matching.Count == 0)
            return null;

        user.LastLoginAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        var allOrganizations = (await _organizationService.ListMineAsync(user.Id, cancellationToken)).ToList();
        var matchingOrganizations = allOrganizations
            .Where(org => matching.Any(m => m.OrganizationId == org.Id))
            .ToList();

        if (matching.Count != 1)
        {
            var (chooserToken, chooserExpires) = _jwtTokenService.CreateToken(user);
            return new LoginResponse
            {
                Token = chooserToken,
                ExpiresAt = chooserExpires,
                User = UserMappings.ToLoginDto(user),
                Permissions = [],
                Organization = null,
                Organizations = matchingOrganizations,
                EnabledPageKeys = []
            };
        }

        var membership = matching[0];
        if (membership.Organization is null)
            return null;

        _tenant.SetMembership(membership.OrganizationId, membership.Id, membership.Role);

        await _auditService.RecordAsync(
            action: "Login",
            entityType: "Employee",
            entityId: user.Id.ToString(),
            entityLabel: user.FullName,
            summary: $"{user.FullName} ({user.Username}) signed in to {membership.Organization.Name}.",
            actorUserId: user.Id,
            actorName: user.FullName,
            cancellationToken: cancellationToken);

        var (token, expiresAt) = _jwtTokenService.CreateToken(user, membership);
        var permissions =
            (await _permissionService.GetUserPermissionsAsync(user.Id, membership.OrganizationId, cancellationToken))
            ?.Permissions ?? [];
        var enabled = AppPages.ParseEnabledKeys(membership.Organization.EnabledPageKeys).ToList();
        var summary = allOrganizations.First(org => org.Id == membership.OrganizationId);
        summary.EnabledPageKeys = enabled;

        return new LoginResponse
        {
            Token = token,
            ExpiresAt = expiresAt,
            User = UserMappings.ToLoginDto(user, membership),
            Permissions = permissions,
            Organization = summary,
            Organizations = allOrganizations,
            EnabledPageKeys = enabled
        };
    }

    public async Task<string?> ChangePasswordAsync(
        ChangePasswordRequest request,
        CancellationToken cancellationToken = default)
    {
        if (_tenant.UserId is not Guid userId)
            return "Not signed in.";

        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsDeleted, cancellationToken);
        if (user is null)
            return "User not found.";

        var newPassword = request.NewPassword?.Trim() ?? "";
        if (newPassword.Length < 6)
            return "Enter a password of at least 6 characters.";

        if (string.Equals(request.CurrentPassword, newPassword, StringComparison.Ordinal))
            return "New password must be different from the current password.";

        if (user.IsPlatformAdmin)
        {
            if (!_passwordService.VerifyPassword(user.PasswordHash, request.CurrentPassword))
                return "Current password is incorrect.";

            user.PasswordHash = _passwordService.HashPassword(newPassword);
        }
        else if (_tenant.MembershipId is Guid membershipId)
        {
            var membership = await _dbContext.OrganizationMemberships
                .Include(m => m.Organization)
                .FirstOrDefaultAsync(
                    m => m.Id == membershipId && m.UserId == user.Id,
                    cancellationToken);
            if (membership is null)
                return "Select an organization first.";

            if (!MatchesOrgPassword(membership, user, request.CurrentPassword))
                return "Current password is incorrect.";

            membership.PasswordHash = _passwordService.HashPassword(newPassword);
        }
        else
        {
            return "Select an organization first.";
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        // Kill the current JWT so a stolen copy cannot keep working after the password change.
        await _tokenRevocation.RevokeCurrentAsync(cancellationToken);

        await _auditService.RecordAsync(
            action: "PasswordChanged",
            entityType: "Employee",
            entityId: user.Id.ToString(),
            entityLabel: user.FullName,
            summary: "Password was changed for this organization only.",
            cancellationToken: cancellationToken);

        return null;
    }

    private bool MatchesOrgPassword(OrganizationMembership membership, User user, string password)
    {
        var hash = string.IsNullOrWhiteSpace(membership.PasswordHash)
            ? user.PasswordHash
            : membership.PasswordHash;
        return _passwordService.VerifyPassword(hash, password);
    }
}
