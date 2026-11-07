using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

[Table("Payments")]
public class Payment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid? OrganizationId { get; set; }

    public Organization? Organization { get; set; }

    [Required]
    public Guid InvoiceId { get; set; }

    public Invoice Invoice { get; set; } = null!;

    [Required]
    [Column(TypeName = "numeric(18,2)")]
    public decimal Amount { get; set; }

    public Guid? RecordedByUserId { get; set; }

    [Required]
    [MaxLength(100)]
    public string RecordedByName { get; set; } = "User";

    public DateTime PaidAt { get; set; } = DateTime.UtcNow;
}
