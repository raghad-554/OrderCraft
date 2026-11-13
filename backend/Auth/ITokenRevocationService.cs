namespace OrderCraft.Auth;

public interface ITokenRevocationService
{
    Task RevokeAsync(
        string jti,
        DateTime expiresAtUtc,
        Guid? userId,
        CancellationToken cancellationToken = default);

    Task<bool> IsRevokedAsync(string jti, CancellationToken cancellationToken = default);

    /// <summary>Revoke the JWT on the current HTTP request (logout / password change).</summary>
    Task RevokeCurrentAsync(CancellationToken cancellationToken = default);
}
