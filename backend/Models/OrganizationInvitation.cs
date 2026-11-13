using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

public enum InvitationStatus
{
    Pending,
    Accepted,
    Revoked,
    Expired
}

[Table("OrganizationInvitations")]
public class OrganizationInvitation
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrganizationId { get; set; }

    [Required]
    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required]
    public Guid OrganizationDepartmentId { get; set; }

    public bool IsOrgAdmin { get; set; }

    [Required]
    public InvitationStatus Status { get; set; } = InvitationStatus.Pending;

    [Required]
    [MaxLength(128)]
    public string TokenHash { get; set; } = string.Empty;

    public DateTime ExpiresAt { get; set; }

    [Required]
    public Guid InvitedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Organization Organization { get; set; } = null!;

    public OrganizationDepartment OrganizationDepartment { get; set; } = null!;
}
