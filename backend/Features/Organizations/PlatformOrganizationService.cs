using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;
using OrderCraft.Tenancy;

namespace OrderCraft.Services;

public class PlatformOrganizationService : IPlatformOrganizationService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IPasswordService _passwords;
    private readonly IAuditService _audit;
    private readonly ITenantContext _tenant;
    private readonly IOrgCatalogService _catalog;

    public PlatformOrganizationService(
        ApplicationDbContext dbContext,
        IPasswordService passwords,
        IAuditService audit,
        ITenantContext tenant,
        IOrgCatalogService catalog)
    {
        _dbContext = dbContext;
        _passwords = passwords;
        _audit = audit;
        _tenant = tenant;
        _catalog = catalog;
    }

    public IReadOnlyList<PlatformPageCatalogItem> ListPages() =>
        AppPages.TenantCatalog
            .Select(p => new PlatformPageCatalogItem
            {
                Key = p.Key,
                Label = p.Label,
                Description = p.Description
            })
            .ToList();

    public async Task<IReadOnlyList<PlatformOrganizationResponse>> ListAsync(
        CancellationToken cancellationToken = default)
    {
        var rows = await _dbContext.Organizations
            .AsNoTracking()
            .OrderBy(o => o.Name)
            .Select(o => new
            {
                Org = o,
                MemberCount = o.Memberships.Count(m => m.Status == MembershipStatus.Active)
            })
            .ToListAsync(cancellationToken);

        return rows.Select(row => ToResponse(row.Org, row.MemberCount)).ToList();
    }

    public async Task<PlatformOrganizationResponse?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var org = await _dbContext.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (org is null)
            return null;

        var count = await _dbContext.OrganizationMemberships.CountAsync(
            m => m.OrganizationId == id && m.Status == MembershipStatus.Active,
            cancellationToken);
        return ToResponse(org, count);
    }

    public async Task<(PlatformOrganizationResponse? Org, string? Error)> CreateAsync(
        CreatePlatformOrganizationRequest request,
        CancellationToken cancellationToken = default)
    {
        var name = request.Name.Trim();
        var slug = string.IsNullOrWhiteSpace(request.Slug) ? MakeSlug(name) : MakeSlug(request.Slug);
        var baseSlug = slug;
        var n = 2;
        while (await _dbContext.Organizations.AnyAsync(o => o.Slug == slug, cancellationToken))
            slug = $"{baseSlug}-{n++}";

        var username = request.AdminUsername.Trim();
        var email = request.AdminEmail.Trim();
        if (await _dbContext.Users.AnyAsync(u => !u.IsDeleted && u.Username.ToLower() == username.ToLower(), cancellationToken))
            return (null, "Username is already taken.");
        if (await _dbContext.Users.AnyAsync(u => !u.IsDeleted && u.Email.ToLower() == email.ToLower(), cancellationToken))
            return (null, "Email is already taken. Use a new email for this organization.");

        var org = new Organization
        {
            Name = name,
            Slug = slug,
            IsActive = true,
            ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail) ? null : request.ContactEmail.Trim(),
            ContactPhone = string.IsNullOrWhiteSpace(request.ContactPhone) ? null : request.ContactPhone.Trim(),
            EnabledPageKeys = AppPages.SerializeEnabledKeys(request.EnabledPageKeys),
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.Organizations.Add(org);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await _catalog.EnsureDefaultsAsync(org.Id, cancellationToken);
        var adminRole = await _catalog.RequireRoleAsync(org.Id, UserRole.Admin, cancellationToken);
        var adminDepartment = await _dbContext.OrganizationDepartments.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                d => d.OrganizationId == org.Id && d.Name == "Administration",
                cancellationToken);

        var admin = new User
        {
            Username = username,
            FullName = request.AdminFullName.Trim(),
            Email = email,
            PasswordHash = _passwords.HashPassword(request.AdminPassword),
            Role = UserRole.Admin,
            PhoneNumber = string.IsNullOrWhiteSpace(request.AdminPhone) ? "+10000000000" : request.AdminPhone.Trim(),
            Department = adminDepartment?.Name ?? "Administration",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.Users.Add(admin);

        var membership = new OrganizationMembership
        {
            OrganizationId = org.Id,
            UserId = admin.Id,
            Status = MembershipStatus.Active,
            PasswordHash = admin.PasswordHash,
            CreatedAt = DateTime.UtcNow,
            User = admin,
            Organization = org
        };
        UserMappings.AssignCatalog(membership, adminRole, adminDepartment);
        _dbContext.OrganizationMemberships.Add(membership);
        UserMappings.SeedDefaultPermissions(_dbContext, membership, UserRole.Admin, org.EnabledPageKeys);

        await _dbContext.SaveChangesAsync(cancellationToken);

        await _audit.RecordAsync(
            action: "Created",
            entityType: "Organization",
            entityId: org.Id.ToString(),
            entityLabel: org.Name,
            summary: $"Organization created with admin {admin.Username}.",
            actorUserId: _tenant.UserId,
            actorName: "Platform admin",
            cancellationToken: cancellationToken);

        return (ToResponse(org, 1), null);
    }

    public async Task<(PlatformOrganizationResponse? Org, string? Error)> UpdateAsync(
        Guid id,
        UpdatePlatformOrganizationRequest request,
        CancellationToken cancellationToken = default)
    {
        var org = await _dbContext.Organizations.FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (org is null)
            return (null, "Organization not found.");

        org.Name = request.Name.Trim();
        org.ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail) ? null : request.ContactEmail.Trim();
        org.ContactPhone = string.IsNullOrWhiteSpace(request.ContactPhone) ? null : request.ContactPhone.Trim();
        org.IsActive = request.IsActive;
        org.EnabledPageKeys = AppPages.SerializeEnabledKeys(request.EnabledPageKeys);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var count = await _dbContext.OrganizationMemberships.CountAsync(
            m => m.OrganizationId == org.Id && m.Status == MembershipStatus.Active,
            cancellationToken);
        return (ToResponse(org, count), null);
    }

    private static PlatformOrganizationResponse ToResponse(Organization org, int memberCount) =>
        new()
        {
            Id = org.Id,
            Name = org.Name,
            Slug = org.Slug,
            IsActive = org.IsActive,
            ContactEmail = org.ContactEmail,
            ContactPhone = org.ContactPhone,
            EnabledPageKeys = AppPages.ParseEnabledKeys(org.EnabledPageKeys).ToList(),
            CreatedAt = org.CreatedAt,
            MemberCount = memberCount
        };

    private static string MakeSlug(string name)
    {
        var chars = name.Trim().ToLowerInvariant()
            .Select(c => char.IsLetterOrDigit(c) ? c : '-')
            .ToArray();
        var slug = new string(chars).Trim('-');
        while (slug.Contains("--", StringComparison.Ordinal))
            slug = slug.Replace("--", "-", StringComparison.Ordinal);
        return string.IsNullOrWhiteSpace(slug) ? "org" : slug[..Math.Min(60, slug.Length)];
    }
}
