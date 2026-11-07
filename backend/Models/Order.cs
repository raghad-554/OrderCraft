using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

public enum OrderDirection
{
    Purchase,
    Sale
}

public enum OrderStatus
{
    Draft,
    Pending,
    Rejected,
    Approved,
    Shipped,
    Delivered,
    Cancelled
}

public enum PaymentTerms
{
    Net30,
    Net60,
    Immediate
}

[Table("Orders")]
public class Order
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(50)]
    public string OrderNumber { get; set; } = string.Empty;

    [Required]
    public Guid OrganizationId { get; set; }

    public Organization Organization { get; set; } = null!;

    [Required]
    public OrderDirection Direction { get; set; } = OrderDirection.Purchase;

    public Guid? BuyerCompanyId { get; set; }

    [Required]
    [MaxLength(200)]
    public string BuyerCompanyName { get; set; } = string.Empty;

    public Guid? SupplierCompanyId { get; set; }

    [Required]
    [MaxLength(200)]
    public string SupplierCompanyName { get; set; } = string.Empty;

    [Required]
    public Guid CreatedByUserId { get; set; }

    [Required]
    public OrderStatus Status { get; set; } = OrderStatus.Pending;

    [Required]
    [Column(TypeName = "numeric(18,2)")]
    public decimal TotalAmount { get; set; }

    public DateTime OrderDate { get; set; } = DateTime.UtcNow;

    public DateTime? DeliveryDate { get; set; }

    public PaymentTerms? PaymentTerms { get; set; }

    [Column(TypeName = "numeric(5,2)")]
    public decimal TaxRate { get; set; }

    [MaxLength(1000)]
    public string? Notes { get; set; }

    [MaxLength(1000)]
    public string? RejectionReason { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public Company? BuyerCompany { get; set; }

    public Company? SupplierCompany { get; set; }

    public User CreatedByUser { get; set; } = null!;

    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();

    public ICollection<Invoice> Invoices { get; set; } = new List<Invoice>();
}
