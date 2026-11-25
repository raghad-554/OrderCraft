namespace OrderCraft.Auth.Claims;

/// <summary>JWT claim type names shared by token issuance and tenancy resolution.</summary>
public static class AuthClaims
{
    public const string OrgId = "orgId";
    public const string OrgRole = "org_role";
    public const string MembershipId = "membershipId";
    public const string Platform = "platform";
}
