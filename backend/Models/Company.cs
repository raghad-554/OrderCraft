using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

public enum CompanyType
{
    Supplier,
    Buyer,
    Both
}

public enum CompanyStatus
{
    Active,
    PendingReview,
    Inactive
}

[Table("Companies")]
public class Company
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrganizationId { get; set; }

    public Organization Organization { get; set; } = null!;

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(256)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [MaxLength(20)]
    public string? Phone { get; set; }

    [MaxLength(500)]
    public string? Address { get; set; }

    [MaxLength(50)]
    public string? TaxNumber { get; set; }

    [Required]
    public CompanyType Type { get; set; }

    public Guid? CategoryId { get; set; }

    [Column(TypeName = "numeric(18,2)")]
    public decimal? CreditLimit { get; set; }

    /// <summary>Payment terms label (e.g. Net 30, Advance 50%).</summary>
    [MaxLength(50)]
    public string? PaymentTerm { get; set; }

    /// <summary>Discount rate as a percentage (0–100).</summary>
    [Column(TypeName = "numeric(5,2)")]
    public decimal? DiscountRate { get; set; }

    /// <summary>How many active orders involve this company (as buyer or supplier).</summary>
    public int OrderCount { get; set; }

    /// <summary>Approved PO spend with this vendor.</summary>
    [Column(TypeName = "numeric(18,2)")]
    public decimal TotalSpend { get; set; }

    /// <summary>Total sales / revenue from this client.</summary>
    [Column(TypeName = "numeric(18,2)")]
    public decimal TotalSales { get; set; }

    /// <summary>Current unpaid balance for this client.</summary>
    [Column(TypeName = "numeric(18,2)")]
    public decimal OutstandingBalance { get; set; }

    /// <summary>Vendor performance rating from 0 to 5.</summary>
    [Column(TypeName = "numeric(3,1)")]
    public decimal? PerformanceScore { get; set; }

    public CompanyStatus Status { get; set; } = CompanyStatus.Active;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public Category? Category { get; set; }

    public ICollection<User> Users { get; set; } = new List<User>();

    public ICollection<Product> Products { get; set; } = new List<Product>();

    public ICollection<Order> BuyerOrders { get; set; } = new List<Order>();

    public ICollection<Order> SupplierOrders { get; set; } = new List<Order>();
}
