using FluentValidation;
using OrderCraft.Models;

namespace OrderCraft.Schemas;

public class PlatformPageCatalogItem
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public class PlatformOrganizationResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public List<string> EnabledPageKeys { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public int MemberCount { get; set; }
}

public class CreatePlatformOrganizationRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Slug { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public List<string>? EnabledPageKeys { get; set; }
    public string AdminUsername { get; set; } = string.Empty;
    public string AdminFullName { get; set; } = string.Empty;
    public string AdminEmail { get; set; } = string.Empty;
    public string AdminPassword { get; set; } = string.Empty;
    public string? AdminPhone { get; set; }
}

public class CreatePlatformOrganizationRequestValidator : AbstractValidator<CreatePlatformOrganizationRequest>
{
    public CreatePlatformOrganizationRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Slug).MaximumLength(80);
        RuleFor(x => x.ContactEmail).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.ContactEmail));
        RuleFor(x => x.ContactPhone).MaximumLength(20);
        RuleFor(x => x.AdminUsername).NotEmpty().MaximumLength(50);
        RuleFor(x => x.AdminFullName).FourPartFullName();
        RuleFor(x => x.AdminEmail).ValidEmailAddress();
        RuleFor(x => x.AdminPassword).NotEmpty().MinimumLength(6);
        RuleFor(x => x.AdminPhone).MaximumLength(20);
    }
}

public class UpdatePlatformOrganizationRequest
{
    public string Name { get; set; } = string.Empty;
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public bool IsActive { get; set; } = true;
    public List<string> EnabledPageKeys { get; set; } = [];
}

public class UpdatePlatformOrganizationRequestValidator : AbstractValidator<UpdatePlatformOrganizationRequest>
{
    public UpdatePlatformOrganizationRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ContactEmail).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.ContactEmail));
        RuleFor(x => x.ContactPhone).MaximumLength(20);
        RuleFor(x => x.EnabledPageKeys).NotNull();
    }
}
