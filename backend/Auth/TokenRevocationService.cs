using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Services;

namespace OrderCraft.Auth;

public sealed class TokenRevocationService : ITokenRevocationService
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly ITenantContext _tenant;

    public TokenRevocationService(
        ApplicationDbContext db,
        IHttpContextAccessor http,
        ITenantContext tenant)
    {
        _db = db;
        _http = http;
        _tenant = tenant;
    }

    public async Task RevokeAsync(
        string jti,
        DateTime expiresAtUtc,
        Guid? userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(jti))
            return;

        var normalized = jti.Trim();
        var exists = await _db.RevokedTokens
            .AsNoTracking()
            .AnyAsync(t => t.Jti == normalized, cancellationToken);
        if (exists)
            return;

        _db.RevokedTokens.Add(new RevokedToken
        {
            Jti = normalized,
            UserId = userId,
            ExpiresAt = expiresAtUtc.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(expiresAtUtc, DateTimeKind.Utc)
                : expiresAtUtc.ToUniversalTime(),
            RevokedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(cancellationToken);

        await CleanupExpiredAsync(cancellationToken);
    }

    public Task<bool> IsRevokedAsync(string jti, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(jti))
            return Task.FromResult(true);

        return _db.RevokedTokens
            .AsNoTracking()
            .AnyAsync(t => t.Jti == jti.Trim(), cancellationToken);
    }

    public async Task RevokeCurrentAsync(CancellationToken cancellationToken = default)
    {
        var http = _http.HttpContext;
        if (http?.User?.Identity?.IsAuthenticated != true)
            return;

        var jti = http.User.FindFirstValue(JwtRegisteredClaimNames.Jti);
        if (string.IsNullOrWhiteSpace(jti))
            return;

        var expUnix = http.User.FindFirstValue(JwtRegisteredClaimNames.Exp);
        var expiresAt = DateTime.UtcNow.AddHours(1);
        if (long.TryParse(expUnix, out var seconds))
            expiresAt = DateTimeOffset.FromUnixTimeSeconds(seconds).UtcDateTime;

        await RevokeAsync(jti, expiresAt, _tenant.UserId, cancellationToken);
    }

    private async Task CleanupExpiredAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        await _db.RevokedTokens
            .Where(t => t.ExpiresAt < now)
            .ExecuteDeleteAsync(cancellationToken);
    }
}
