using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrderCraft.Models;

[Table("OrganizationRoles")]
public class OrganizationRole
{
    public const string AdminKey = "Admin";

    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrganizationId { get; set; }

    [Required]
    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;

    [Required]
    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    [Required]
    public UserRole Template { get; set; } = UserRole.ProcurementManager;

    public bool IsSystem { get; set; }

    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Organization Organization { get; set; } = null!;

    public ICollection<OrganizationMembership> Memberships { get; set; } = new List<OrganizationMembership>();

    public bool IsSystemAdmin =>
        IsSystem && string.Equals(Key, AdminKey, StringComparison.OrdinalIgnoreCase);

    public UserRole PrivilegeRole => IsSystemAdmin ? UserRole.Admin : Template;
}

[Table("OrganizationDepartments")]
public class OrganizationDepartment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrganizationId { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Organization Organization { get; set; } = null!;

    public ICollection<OrganizationMembership> Memberships { get; set; } = new List<OrganizationMembership>();

    public ICollection<OrganizationDepartmentPermission> Permissions { get; set; } =
        new List<OrganizationDepartmentPermission>();
}

[Table("OrganizationDepartmentPermissions")]
public class OrganizationDepartmentPermission
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public Guid DepartmentId { get; set; }

    [Required]
    [MaxLength(50)]
    public string PageKey { get; set; } = string.Empty;

    [Required]
    public PageAccessLevel AccessLevel { get; set; } = PageAccessLevel.Hidden;

    public OrganizationDepartment Department { get; set; } = null!;
}
