using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Services;

namespace OrderCraft.Auth;

public class TenantMiddleware
{
    public const string OrgIdClaim = "orgId";
    public const string OrgRoleClaim = "org_role";
    public const string MembershipIdClaim = "membershipId";
    public const string PlatformClaim = "platform";

    private readonly RequestDelegate _next;

    public TenantMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ITenantContext tenant, ApplicationDbContext db)
    {
        tenant.Clear();

        if (context.User.Identity?.IsAuthenticated == true)
        {
            var userId = ReadUserId(context.User);
            if (userId.HasValue)
                tenant.SetUser(userId.Value);

            var endpoint = context.GetEndpoint();
            var allowAnonymous = endpoint?.Metadata.GetMetadata<Microsoft.AspNetCore.Authorization.AllowAnonymousAttribute>() is not null;
            var allowNoOrg = endpoint?.Metadata.GetMetadata<AllowNoOrganizationAttribute>() is not null
                || IsOrganizationBootstrapPath(context.Request);

            if (!allowAnonymous)
            {
                var isPlatform = string.Equals(
                    context.User.FindFirstValue(PlatformClaim),
                    "true",
                    StringComparison.OrdinalIgnoreCase);

                if (isPlatform)
                {
                    tenant.SetPlatformAdmin();
                    var path = context.Request.Path.Value ?? "";
                    if (!path.StartsWith("/api/platform", StringComparison.OrdinalIgnoreCase)
                        && !path.Equals("/api/Auth/change-password", StringComparison.OrdinalIgnoreCase))
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        await context.Response.WriteAsJsonAsync(new { message = "Platform administrators cannot access tenant data." });
                        return;
                    }
                }
                else
                {
                    var orgId = ReadGuid(
                        context.User.FindFirstValue(OrgIdClaim)
                        ?? context.User.FindFirstValue("organizationId"));

                    if (orgId.HasValue && userId.HasValue)
                    {
                        var membership = await db.OrganizationMemberships
                            .AsNoTracking()
                            .Include(m => m.Organization)
                            .FirstOrDefaultAsync(
                                m => m.OrganizationId == orgId.Value && m.UserId == userId.Value,
                                context.RequestAborted);

                        if (membership is null
                            || membership.Status != MembershipStatus.Active
                            || membership.Organization is null
                            || !membership.Organization.IsActive)
                        {
                            context.Response.StatusCode = StatusCodes.Status403Forbidden;
                            await context.Response.WriteAsJsonAsync(new { message = "Organization access is not active." });
                            return;
                        }

                        tenant.SetMembership(membership.OrganizationId, membership.Id, membership.Role);
                    }
                    else if (!allowNoOrg)
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        await context.Response.WriteAsJsonAsync(new { message = "Select an organization first." });
                        return;
                    }
                }
            }
        }

        await _next(context);
    }

    private static Guid? ReadUserId(ClaimsPrincipal user)
    {
        var raw =
            user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return ReadGuid(raw);
    }

    private static Guid? ReadGuid(string? value) =>
        Guid.TryParse(value, out var id) ? id : null;

    private static bool IsOrganizationBootstrapPath(HttpRequest request)
    {
        var path = request.Path.Value ?? "";
        if (!path.StartsWith("/api/Organizations", StringComparison.OrdinalIgnoreCase))
            return false;

        if (HttpMethods.IsGet(request.Method)
            && path.Equals("/api/Organizations/mine", StringComparison.OrdinalIgnoreCase))
            return true;

        if (HttpMethods.IsPost(request.Method)
            && path.EndsWith("/switch", StringComparison.OrdinalIgnoreCase))
            return true;

        return false;
    }
}
