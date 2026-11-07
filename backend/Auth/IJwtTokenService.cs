using OrderCraft.Models;

namespace OrderCraft.Auth;

public interface IJwtTokenService
{
    (string Token, DateTime ExpiresAt) CreateToken(User user, OrganizationMembership? membership = null);
}
