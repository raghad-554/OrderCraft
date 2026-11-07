using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

[Table("OrderFieldChanges")]
public class OrderFieldChange
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? OrganizationId { get; set; }

    public Organization? Organization { get; set; }

    [Required]
    public Guid OrderId { get; set; }

    public Order Order { get; set; } = null!;

    public Guid? ActorUserId { get; set; }

    [Required]
    [MaxLength(100)]
    public string ActorName { get; set; } = "System";

    [Required]
    [MaxLength(200)]
    public string Field { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? OldValue { get; set; }

    [MaxLength(1000)]
    public string? NewValue { get; set; }

    public int Sequence { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
