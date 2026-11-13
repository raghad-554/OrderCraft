using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Services;

namespace OrderCraft.Auth;

/// <summary>
/// Replays stored responses for mutating POSTs that send Idempotency-Key.
/// Missing key remains backward compatible (request proceeds normally).
/// </summary>
public sealed class IdempotencyMiddleware
{
    public const string HeaderName = "Idempotency-Key";
    private const int MaxKeyLength = 128;
    private const int MaxResponseBytes = 65536;
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    private static readonly Regex[] ProtectedPaths =
    [
        new(@"^/api/Orders/?$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"^/api/Invoices/?$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"^/api/Invoices/from-order/[^/]+/?$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"^/api/Orders/[^/]+/invoice/?$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"^/api/Invoices/[^/]+/payments/?$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly RequestDelegate _next;

    public IdempotencyMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(
        HttpContext context,
        ApplicationDbContext db,
        ITenantContext tenant)
    {
        if (!HttpMethods.IsPost(context.Request.Method)
            || !IsProtectedPath(context.Request.Path)
            || !TryGetKey(context, out var key))
        {
            await _next(context);
            return;
        }

        if (!tenant.HasOrganization || tenant.UserId is not { } userId)
        {
            await _next(context);
            return;
        }

        var organizationId = tenant.OrganizationId!.Value;
        var path = context.Request.Path.Value ?? string.Empty;

        context.Request.EnableBuffering();
        var requestHash = await HashBodyAsync(context.Request, context.RequestAborted);

        var existing = await db.IdempotencyRecords
            .AsNoTracking()
            .FirstOrDefaultAsync(
                r => r.OrganizationId == organizationId
                     && r.UserId == userId
                     && r.Key == key,
                context.RequestAborted);

        if (existing is not null)
        {
            if (!string.Equals(existing.RequestHash, requestHash, StringComparison.Ordinal))
            {
                context.Response.StatusCode = StatusCodes.Status409Conflict;
                context.Response.ContentType = "application/json; charset=utf-8";
                await context.Response.WriteAsync(
                    JsonSerializer.Serialize(
                        new { message = "Idempotency-Key was already used with a different request body." },
                        JsonOptions),
                    context.RequestAborted);
                return;
            }

            context.Response.StatusCode = existing.StatusCode;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsync(existing.ResponseBody ?? string.Empty, context.RequestAborted);
            return;
        }

        var originalBody = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await _next(context);

            buffer.Position = 0;
            var responseBytes = buffer.ToArray();
            var responseText = Encoding.UTF8.GetString(responseBytes);
            if (responseText.Length > MaxResponseBytes)
                responseText = responseText[..MaxResponseBytes];

            if (context.Response.StatusCode is >= 200 and < 300)
            {
                await CleanupExpiredAsync(db, context.RequestAborted);

                db.IdempotencyRecords.Add(new IdempotencyRecord
                {
                    OrganizationId = organizationId,
                    UserId = userId,
                    Key = key,
                    Method = "POST",
                    Path = path.Length > 512 ? path[..512] : path,
                    RequestHash = requestHash,
                    StatusCode = context.Response.StatusCode,
                    ResponseBody = responseText,
                    CreatedAt = DateTime.UtcNow
                });

                try
                {
                    await db.SaveChangesAsync(context.RequestAborted);
                }
                catch (DbUpdateException)
                {
                    // Concurrent first-writer won; ignore store failure — response already produced.
                    db.ChangeTracker.Clear();
                }
            }

            buffer.Position = 0;
            context.Response.Body = originalBody;
            await buffer.CopyToAsync(originalBody, context.RequestAborted);
        }
        finally
        {
            context.Response.Body = originalBody;
        }
    }

    private static bool IsProtectedPath(PathString path)
    {
        var value = path.Value ?? string.Empty;
        return ProtectedPaths.Any(r => r.IsMatch(value));
    }

    private static bool TryGetKey(HttpContext context, out string key)
    {
        key = string.Empty;
        var raw = context.Request.Headers[HeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(raw))
            return false;

        key = raw.Trim();
        if (key.Length > MaxKeyLength)
            key = key[..MaxKeyLength];

        return key.Length > 0;
    }

    private static async Task<string> HashBodyAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        request.Body.Position = 0;
        using var sha = SHA256.Create();
        var hash = await sha.ComputeHashAsync(request.Body, cancellationToken);
        request.Body.Position = 0;
        return Convert.ToHexString(hash);
    }

    private static async Task CleanupExpiredAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        var cutoff = DateTime.UtcNow - Ttl;
        var expired = await db.IdempotencyRecords
            .Where(r => r.CreatedAt < cutoff)
            .OrderBy(r => r.CreatedAt)
            .Take(100)
            .ToListAsync(cancellationToken);

        if (expired.Count == 0)
            return;

        db.IdempotencyRecords.RemoveRange(expired);
        await db.SaveChangesAsync(cancellationToken);
    }
}
