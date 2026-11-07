using FluentValidation;
using OrderCraft.Models;

namespace OrderCraft.Schemas;

public class OrganizationRoleResponse
{
    public Guid Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public UserRole Template { get; set; }
    public bool IsSystem { get; set; }
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
    public int MemberCount { get; set; }
}

public class OrganizationDepartmentResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
    public int MemberCount { get; set; }
    public List<PagePermissionItem> Permissions { get; set; } = [];
}

public class UpsertOrganizationRoleRequest
{
    public string Name { get; set; } = string.Empty;
    public UserRole Template { get; set; } = UserRole.ProcurementManager;
    public bool IsActive { get; set; } = true;
}

public class UpsertOrganizationDepartmentRequest
{
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public List<PagePermissionItem> Permissions { get; set; } = [];
}

public class UpsertOrganizationRoleRequestValidator : AbstractValidator<UpsertOrganizationRoleRequest>
{
    public UpsertOrganizationRoleRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Template)
            .Must(t => t is UserRole.ProcurementManager or UserRole.Finance or UserRole.Admin)
            .WithMessage("Template must be Admin, ProcurementManager, or Finance.");
    }
}

public class UpsertOrganizationDepartmentRequestValidator : AbstractValidator<UpsertOrganizationDepartmentRequest>
{
    public UpsertOrganizationDepartmentRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleForEach(x => x.Permissions).ChildRules(item =>
        {
            item.RuleFor(x => x.PageKey).NotEmpty().MaximumLength(50);
            item.RuleFor(x => x.AccessLevel).IsInEnum();
        });
    }
}
