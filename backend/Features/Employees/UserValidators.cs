using FluentValidation;
using OrderCraft.Models;

namespace OrderCraft.Schemas;

public abstract class UserRequestBase
{
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Password { get; set; }
    public Guid? RoleId { get; set; }
    public Guid? DepartmentId { get; set; }
    public bool IsOrgAdmin { get; set; }
    public string PhoneNumber { get; set; } = string.Empty;
    public Guid? CompanyId { get; set; }
    public bool IsActive { get; set; } = true;
}

public class CreateUserRequest : UserRequestBase
{
    public new string Password
    {
        get => base.Password ?? string.Empty;
        set => base.Password = value;
    }
}

public class UpdateUserRequest : UserRequestBase;

public class ResetPasswordRequest
{
    public string NewPassword { get; set; } = string.Empty;
}

public class ResetPasswordResponse
{
    public Guid UserId { get; set; }
}

public class UserResponse
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public Guid? RoleId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public string RoleKey { get; set; } = string.Empty;
    public bool IsSystemRole { get; set; }
    public string PhoneNumber { get; set; } = string.Empty;
    public string? Department { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? CompanyId { get; set; }
    public string? CompanyName { get; set; }
    public bool IsActive { get; set; }
    public Guid? MembershipId { get; set; }
    public string? MembershipStatus { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public abstract class UserRequestValidatorBase<T> : AbstractValidator<T>
    where T : UserRequestBase
{
    protected UserRequestValidatorBase(bool passwordRequired)
    {
        RuleFor(x => x.Username)
            .NotEmpty()
            .MaximumLength(50);

        RuleFor(x => x.FullName)
            .FourPartFullName();

        RuleFor(x => x.Email)
            .ValidEmailAddress();

        if (passwordRequired)
        {
            RuleFor(x => x.Password)
                .NotEmpty()
                .MinimumLength(6);
        }
        else
        {
            RuleFor(x => x.Password)
                .MinimumLength(6)
                .When(x => !string.IsNullOrWhiteSpace(x.Password));
        }

        RuleFor(x => x.DepartmentId)
            .NotEmpty()
            .WithMessage("Department is required.");

        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .MaximumLength(20);
    }
}

public class CreateUserRequestValidator : UserRequestValidatorBase<CreateUserRequest>
{
    public CreateUserRequestValidator() : base(passwordRequired: true)
    {
    }
}

public class UpdateUserRequestValidator : UserRequestValidatorBase<UpdateUserRequest>
{
    public UpdateUserRequestValidator() : base(passwordRequired: false)
    {
    }
}

public class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.NewPassword)
            .NotEmpty()
            .MinimumLength(6);
    }
}
