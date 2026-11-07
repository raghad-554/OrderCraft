using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

public enum InvoiceStatus
{
    Paid,
    Unpaid,
    PartiallyPaid,
    Overdue
}

[Table("Invoices")]
public class Invoice
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrganizationId { get; set; }

    public Organization Organization { get; set; } = null!;

    [Required]
    public Guid OrderId { get; set; }

    [Required]
    [MaxLength(50)]
    public string InvoiceNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(3)]
    public string Currency { get; set; } = "USD";

    [Required]
    [Column(TypeName = "numeric(18,2)")]
    public decimal Amount { get; set; }

    [Required]
    public InvoiceStatus Status { get; set; } = InvoiceStatus.Unpaid;

    public DateTime DueDate { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public Order Order { get; set; } = null!;

    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
