using FluentValidation;
using OrderCraft.Models;

namespace OrderCraft.Schemas;

public class PageCatalogItemResponse
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
}

public class PagePermissionItem
{
    public string PageKey { get; set; } = string.Empty;
    public PageAccessLevel AccessLevel { get; set; } = PageAccessLevel.Hidden;
}

public class UserPermissionsResponse
{
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public bool IsAdmin { get; set; }
    public List<PagePermissionItem> Permissions { get; set; } = [];
}

public class UpdateUserPermissionsRequest
{
    public List<PagePermissionItem> Permissions { get; set; } = [];
}

public class UpdateUserPermissionsRequestValidator : AbstractValidator<UpdateUserPermissionsRequest>
{
    public UpdateUserPermissionsRequestValidator()
    {
        RuleFor(x => x.Permissions)
            .NotNull();

        RuleForEach(x => x.Permissions).ChildRules(item =>
        {
            item.RuleFor(x => x.PageKey)
                .NotEmpty()
                .MaximumLength(50);

            item.RuleFor(x => x.AccessLevel)
                .IsInEnum();
        });
    }
}
