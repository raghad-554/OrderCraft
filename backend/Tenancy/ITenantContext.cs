using OrderCraft.Models;

namespace OrderCraft.Tenancy;

public interface ITenantContext
{
    Guid? UserId { get; }
    Guid? OrganizationId { get; }
    Guid? MembershipId { get; }
    UserRole? Role { get; }
    bool HasOrganization { get; }
    bool IsOrgAdmin { get; }
    bool IsPlatformAdmin { get; }
    Guid RequireOrganizationId();
    void SetUser(Guid userId);
    void SetPlatformAdmin();
    void SetMembership(Guid organizationId, Guid membershipId, UserRole role);
    void Clear();
}

public sealed class TenantContext : ITenantContext
{
    public Guid? UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }
    public Guid? MembershipId { get; private set; }
    public UserRole? Role { get; private set; }
    public bool HasOrganization => OrganizationId.HasValue && OrganizationId.Value != Guid.Empty;
    public bool IsOrgAdmin => Role == UserRole.Admin;
    public bool IsPlatformAdmin { get; private set; }

    public Guid RequireOrganizationId() =>
        OrganizationId is { } id && id != Guid.Empty
            ? id
            : throw new InvalidOperationException("Organization context is required.");

    public void SetUser(Guid userId) => UserId = userId;

    public void SetPlatformAdmin()
    {
        IsPlatformAdmin = true;
        OrganizationId = null;
        MembershipId = null;
        Role = null;
    }

    public void SetMembership(Guid organizationId, Guid membershipId, UserRole role)
    {
        OrganizationId = organizationId;
        MembershipId = membershipId;
        Role = role;
        IsPlatformAdmin = false;
    }

    public void Clear()
    {
        UserId = null;
        OrganizationId = null;
        MembershipId = null;
        Role = null;
        IsPlatformAdmin = false;
    }
}
