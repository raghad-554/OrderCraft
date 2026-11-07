using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

public enum PageAccessLevel
{
    Hidden,
    View,
    Edit
}

[Table("UserPagePermissions")]
public class UserPagePermission
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid MembershipId { get; set; }

    [Required]
    [MaxLength(50)]
    public string PageKey { get; set; } = string.Empty;

    [Required]
    public PageAccessLevel AccessLevel { get; set; } = PageAccessLevel.Hidden;

    public OrganizationMembership Membership { get; set; } = null!;
}
