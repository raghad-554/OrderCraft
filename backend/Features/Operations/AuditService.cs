using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public class AuditService : IAuditService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ITenantContext _tenant;

    public AuditService(
        ApplicationDbContext dbContext,
        IHttpContextAccessor httpContextAccessor,
        ITenantContext tenant)
    {
        _dbContext = dbContext;
        _httpContextAccessor = httpContextAccessor;
        _tenant = tenant;
    }

    public async Task<IReadOnlyList<AuditLogResponse>> GetAllAsync(
        string? entityType = null,
        string? action = null,
        string? search = null,
        Guid? employeeId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.AuditLogs.AsNoTracking().AsQueryable();

        if (employeeId.HasValue)
        {
            var employeeKey = employeeId.Value.ToString();
            query = query.Where(a =>
                a.ActorUserId == employeeId.Value
                || ((a.EntityType == "Employee" || a.EntityType == "User")
                    && a.EntityId == employeeKey));
        }

        if (!string.IsNullOrWhiteSpace(entityType))
        {
            var type = entityType.Trim();
            query = query.Where(a => a.EntityType == type);
        }

        if (!string.IsNullOrWhiteSpace(action))
        {
            var act = action.Trim();
            query = query.Where(a => a.Action == act);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(a =>
                EF.Functions.ILike(a.ActorName, term)
                || EF.Functions.ILike(a.Action, term)
                || EF.Functions.ILike(a.EntityType, term)
                || (a.EntityLabel != null && EF.Functions.ILike(a.EntityLabel, term))
                || (a.Summary != null && EF.Functions.ILike(a.Summary, term))
                || (a.RequestId != null && EF.Functions.ILike(a.RequestId, term)));
        }

        var rows = await query
            .OrderByDescending(a => a.CreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        return rows.Select(ToResponse).ToList();
    }

    public async Task RecordAsync(
        string action,
        string entityType,
        string? entityId = null,
        string? entityLabel = null,
        string? summary = null,
        Guid? actorUserId = null,
        string? actorName = null,
        CancellationToken cancellationToken = default)
    {
        var (resolvedUserId, resolvedName) = ResolveActor(actorUserId, actorName);

        var http = _httpContextAccessor.HttpContext;
        var requestId = http is null ? null : RequestCorrelation.Get(http);

        var entry = new AuditLog
        {
            OrganizationId = _tenant.OrganizationId,
            ActorUserId = resolvedUserId,
            ActorName = string.IsNullOrWhiteSpace(resolvedName) ? "System" : resolvedName.Trim(),
            Action = action.Trim(),
            EntityType = entityType.Trim(),
            EntityId = string.IsNullOrWhiteSpace(entityId) ? null : entityId.Trim(),
            EntityLabel = string.IsNullOrWhiteSpace(entityLabel) ? null : entityLabel.Trim(),
            Summary = string.IsNullOrWhiteSpace(summary) ? null : summary.Trim(),
            RequestId = string.IsNullOrWhiteSpace(requestId) ? null : requestId.Trim(),
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.AuditLogs.Add(entry);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private (Guid? UserId, string Name) ResolveActor(Guid? actorUserId, string? actorName)
    {
        if (actorUserId.HasValue || !string.IsNullOrWhiteSpace(actorName))
            return (actorUserId, actorName ?? "System");

        var user = _httpContextAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated != true)
            return (null, "System");

        var idValue =
            user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue(JwtRegisteredClaimNames.Sub);

        Guid? userId = Guid.TryParse(idValue, out var parsed) ? parsed : null;

        var name =
            user.FindFirstValue(ClaimTypes.Name)
            ?? user.FindFirstValue(JwtRegisteredClaimNames.UniqueName)
            ?? user.FindFirstValue("username")
            ?? user.Identity?.Name
            ?? "User";

        return (userId, name);
    }

    private static AuditLogResponse ToResponse(AuditLog log) => new()
    {
        Id = log.Id,
        ActorUserId = log.ActorUserId,
        ActorName = log.ActorName,
        Action = log.Action,
        EntityType = log.EntityType,
        EntityId = log.EntityId,
        EntityLabel = log.EntityLabel,
        Summary = log.Summary,
        RequestId = log.RequestId,
        CreatedAt = log.CreatedAt
    };
}
