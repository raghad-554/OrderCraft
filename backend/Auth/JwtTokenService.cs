using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using OrderCraft.Models;

namespace OrderCraft.Auth;

public class JwtTokenService : IJwtTokenService
{
    private readonly JwtSettings _jwtSettings;

    public JwtTokenService(IOptions<JwtSettings> jwtSettings)
    {
        _jwtSettings = jwtSettings.Value;
    }

    public (string Token, DateTime ExpiresAt) CreateToken(User user, OrganizationMembership? membership = null)
    {
        var expiresAt = DateTime.UtcNow.AddMinutes(_jwtSettings.ExpireMinutes);

        var role = membership?.Role ?? user.Role;
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, user.Username),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Role, role.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        if (user.IsPlatformAdmin)
        {
            claims.Add(new Claim(TenantMiddleware.PlatformClaim, "true"));
        }
        else if (membership is not null)
        {
            claims.Add(new Claim(TenantMiddleware.OrgIdClaim, membership.OrganizationId.ToString()));
            claims.Add(new Claim(TenantMiddleware.OrgRoleClaim, membership.Role.ToString()));
            claims.Add(new Claim(TenantMiddleware.MembershipIdClaim, membership.Id.ToString()));
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _jwtSettings.Audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: credentials);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);
        return (tokenString, expiresAt);
    }
}
