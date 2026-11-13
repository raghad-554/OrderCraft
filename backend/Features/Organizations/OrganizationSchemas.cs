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

public class CreateInvitationRequest
{
    public string Email { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
    public bool IsOrgAdmin { get; set; }
}

public class CreateInvitationRequestValidator : AbstractValidator<CreateInvitationRequest>
{
    public CreateInvitationRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.DepartmentId).NotEmpty();
    }
}

public class AcceptInvitationRequest
{
    public string Token { get; set; } = string.Empty;
    /// <summary>Required when no account exists yet for the invite email.</summary>
    public string? Username { get; set; }
    public string? FullName { get; set; }
    public string? Password { get; set; }
}

public class AcceptInvitationRequestValidator : AbstractValidator<AcceptInvitationRequest>
{
    public AcceptInvitationRequestValidator()
    {
        RuleFor(x => x.Token).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Username).MaximumLength(50).When(x => !string.IsNullOrWhiteSpace(x.Username));
        RuleFor(x => x.FullName).MaximumLength(100).When(x => !string.IsNullOrWhiteSpace(x.FullName));
        RuleFor(x => x.Password).MinimumLength(6).When(x => !string.IsNullOrWhiteSpace(x.Password));
    }
}

public class InvitationResponse
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public bool IsOrgAdmin { get; set; }
    public InvitationStatus Status { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid InvitedByUserId { get; set; }
    /// <summary>Raw token — only returned once on create.</summary>
    public string? AcceptToken { get; set; }
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
