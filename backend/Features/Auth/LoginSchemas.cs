using FluentValidation;
using OrderCraft.Models;

namespace OrderCraft.Schemas;

public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    /// <summary>When true, auth cookie persists for JWT ExpireMinutes; otherwise session cookie.</summary>
    public bool RememberMe { get; set; }
}

public class LoginUserDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string? Department { get; set; }
}

public class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public LoginUserDto User { get; set; } = new();
    public List<PagePermissionItem> Permissions { get; set; } = [];
    public OrganizationSummary? Organization { get; set; }
    public List<OrganizationSummary> Organizations { get; set; } = [];
    public bool IsPlatformAdmin { get; set; }
    public List<string> EnabledPageKeys { get; set; } = [];
}

public class ChangePasswordRequest
{
    public string CurrentPassword { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}

public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Username)
            .NotEmpty()
            .MaximumLength(256);

        RuleFor(x => x.Password)
            .NotEmpty();
    }
}

public class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(6);
    }
}
