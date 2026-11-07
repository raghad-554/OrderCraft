using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface IAuditService
{
    Task<IReadOnlyList<AuditLogResponse>> GetAllAsync(
        string? entityType = null,
        string? action = null,
        string? search = null,
        Guid? employeeId = null,
        CancellationToken cancellationToken = default);

    Task RecordAsync(
        string action,
        string entityType,
        string? entityId = null,
        string? entityLabel = null,
        string? summary = null,
        Guid? actorUserId = null,
        string? actorName = null,
        CancellationToken cancellationToken = default);
}
