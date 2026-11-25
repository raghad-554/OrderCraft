using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

[Table("OrderItems")]
public class OrderItem
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid OrderId { get; set; }

    [Required]
    public Guid ProductId { get; set; }

    [Required]
    public int Quantity { get; set; }

    [Required]
    [Column(TypeName = "numeric(18,2)")]
    public decimal UnitPrice { get; set; }

    /// <summary>Money taken off this line. Tax is calculated after this amount.</summary>
    [Required]
    [Column(TypeName = "numeric(18,2)")]
    public decimal DiscountAmount { get; set; }

    [Required]
    [Column(TypeName = "numeric(18,2)")]
    public decimal TotalPrice { get; set; }

    public Order Order { get; set; } = null!;

    /// <summary>Optional so soft-deleted products do not hide order lines on load.</summary>
    public Product? Product { get; set; }
}
