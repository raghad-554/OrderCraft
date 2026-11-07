using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

public enum MembershipStatus
{
    Active,
    Suspended,
    Revoked
}

[Table("Organizations")]
public class Organization
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(80)]
    public string Slug { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    [MaxLength(256)]
    public string? ContactEmail { get; set; }

    [MaxLength(20)]
    public string? ContactPhone { get; set; }

    /// <summary>Comma-separated AppPages keys this tenant may use.</summary>
    [Required]
    [MaxLength(2000)]
    public string EnabledPageKeys { get; set; } = string.Empty;

    /// <summary>
    /// Order totals above this amount require an organization admin to approve.
    /// Zero keeps the normal approval rule for every order.
    /// </summary>
    [Column(TypeName = "numeric(18,2)")]
    public decimal ApprovalThreshold { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<OrganizationMembership> Memberships { get; set; } = new List<OrganizationMembership>();

    public ICollection<OrganizationRole> Roles { get; set; } = new List<OrganizationRole>();

    public ICollection<OrganizationDepartment> Departments { get; set; } = new List<OrganizationDepartment>();
}

[Table("OrganizationMemberships")]
public class OrganizationMembership
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrganizationId { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [Required]
    public UserRole Role { get; set; }

    public Guid OrganizationRoleId { get; set; }

    public Guid? OrganizationDepartmentId { get; set; }

    [Required]
    public MembershipStatus Status { get; set; } = MembershipStatus.Active;

    /// <summary>Password for this organization only. Other memberships keep their own hash.</summary>
    [Required]
    [MaxLength(512)]
    public string PasswordHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Organization Organization { get; set; } = null!;

    public User User { get; set; } = null!;

    public OrganizationRole OrganizationRole { get; set; } = null!;

    public OrganizationDepartment? OrganizationDepartment { get; set; }

    public ICollection<UserPagePermission> PagePermissions { get; set; } = new List<UserPagePermission>();
}
