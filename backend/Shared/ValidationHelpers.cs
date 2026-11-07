using System.Text.RegularExpressions;
using FluentValidation;

namespace OrderCraft.Schemas;

public static class ValidationHelpers
{
    public static readonly Regex EmailPattern = new(
        @"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public const string EmailMessage = "Email must contain '@' and '.' (e.g. name@company.com).";
    public const string FourPartNameMessage =
        "Full name must contain exactly 4 parts (e.g. First Second Third Family).";

    public static bool IsValidEmail(string? email) =>
        !string.IsNullOrWhiteSpace(email) && EmailPattern.IsMatch(email);

    public static bool HasFourNameParts(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName))
            return false;

        return fullName
            .Trim()
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Length == 4;
    }
}

public static class FluentValidationExtensions
{
    public static IRuleBuilderOptions<T, string> ValidEmailAddress<T>(
        this IRuleBuilder<T, string> ruleBuilder)
    {
        return ruleBuilder
            .NotEmpty()
            .MaximumLength(256)
            .Must(ValidationHelpers.IsValidEmail)
            .WithMessage(ValidationHelpers.EmailMessage);
    }

    public static IRuleBuilderOptions<T, string> FourPartFullName<T>(
        this IRuleBuilder<T, string> ruleBuilder)
    {
        return ruleBuilder
            .NotEmpty()
            .Must(ValidationHelpers.HasFourNameParts)
            .WithMessage(ValidationHelpers.FourPartNameMessage);
    }
}
