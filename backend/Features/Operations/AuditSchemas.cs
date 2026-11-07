namespace OrderCraft.Schemas;

public class AuditLogResponse
{
    public Guid Id { get; set; }
    public Guid? ActorUserId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string? EntityLabel { get; set; }
    public string? Summary { get; set; }
    public DateTime CreatedAt { get; set; }
}
