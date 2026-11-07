using FluentValidation;
using OrderCraft.Models;

namespace OrderCraft.Schemas;

public class OrganizationSummary
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public Guid MembershipId { get; set; }
    public UserRole Role { get; set; }
    public MembershipStatus Status { get; set; }
    public List<string> EnabledPageKeys { get; set; } = [];
}

public class CreateOrganizationRequest
{
    public string Name { get; set; } = string.Empty;
}

public class CreateOrganizationRequestValidator : AbstractValidator<CreateOrganizationRequest>
{
    public CreateOrganizationRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}

public class AddExistingMemberRequest
{
    public string UsernameOrEmail { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
    public bool IsOrgAdmin { get; set; }
}

public class AddExistingMemberRequestValidator : AbstractValidator<AddExistingMemberRequest>
{
    public AddExistingMemberRequestValidator()
    {
        RuleFor(x => x.UsernameOrEmail).NotEmpty().MaximumLength(256);
        RuleFor(x => x.DepartmentId).NotEmpty();
    }
}

public class SwitchOrganizationRequest
{
    public string Password { get; set; } = string.Empty;
}

public class SwitchOrganizationRequestValidator : AbstractValidator<SwitchOrganizationRequest>
{
    public SwitchOrganizationRequestValidator()
    {
        RuleFor(x => x.Password).NotEmpty();
    }
}

public class OrganizationSettingsResponse
{
    public decimal ApprovalThreshold { get; set; }
}

public class UpdateOrganizationSettingsRequest
{
    public decimal ApprovalThreshold { get; set; }
}

public class UpdateOrganizationSettingsRequestValidator : AbstractValidator<UpdateOrganizationSettingsRequest>
{
    public UpdateOrganizationSettingsRequestValidator()
    {
        RuleFor(x => x.ApprovalThreshold)
            .GreaterThanOrEqualTo(0)
            .LessThanOrEqualTo(1_000_000_000m)
            .WithMessage("ApprovalThreshold must be between 0 and 1000000000.");
    }
}

public class SwitchOrganizationResponse
{
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public OrganizationSummary Organization { get; set; } = new();
    public List<PagePermissionItem> Permissions { get; set; } = [];
    public LoginUserDto User { get; set; } = new();
    public List<string> EnabledPageKeys { get; set; } = [];
}
