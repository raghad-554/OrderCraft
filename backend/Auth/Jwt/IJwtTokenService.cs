using OrderCraft.Models;

namespace OrderCraft.Auth.Jwt;

public interface IJwtTokenService
{
    (string Token, DateTime ExpiresAt) CreateToken(
        User user,
        OrganizationMembership? membership = null);
}
