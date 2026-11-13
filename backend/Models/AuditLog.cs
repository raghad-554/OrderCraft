using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

[Table("AuditLogs")]
public class AuditLog
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? OrganizationId { get; set; }

    public Organization? Organization { get; set; }

    public Guid? ActorUserId { get; set; }

    [Required]
    [MaxLength(100)]
    public string ActorName { get; set; } = "System";

    [Required]
    [MaxLength(50)]
    public string Action { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string EntityType { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? EntityId { get; set; }

    [MaxLength(200)]
    public string? EntityLabel { get; set; }

    [MaxLength(1000)]
    public string? Summary { get; set; }

    [MaxLength(64)]
    public string? RequestId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
