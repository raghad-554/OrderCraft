using FluentValidation;
using OrderCraft.Models;

namespace OrderCraft.Schemas;

public abstract class CompanyRequestBase
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? TaxNumber { get; set; }
    public CompanyType Type { get; set; }
    public Guid? CategoryId { get; set; }
    public decimal? CreditLimit { get; set; }
    public string? PaymentTerm { get; set; }
    public decimal? DiscountRate { get; set; }
    public decimal? TotalSpend { get; set; }
    public decimal? TotalSales { get; set; }
    public decimal? OutstandingBalance { get; set; }
    public decimal? PerformanceScore { get; set; }
    public CompanyStatus Status { get; set; } = CompanyStatus.Active;
}

public class CreateCompanyRequest : CompanyRequestBase;

public class UpdateCompanyRequest : CompanyRequestBase;

public class CompanyResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? TaxNumber { get; set; }
    public CompanyType Type { get; set; }
    public Guid? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public decimal? CreditLimit { get; set; }
    public string? PaymentTerm { get; set; }
    public decimal? DiscountRate { get; set; }
    public int OrderCount { get; set; }
    public decimal TotalSpend { get; set; }
    public decimal TotalSales { get; set; }
    public decimal OutstandingBalance { get; set; }
    public decimal PayableBalance { get; set; }
    public decimal? PerformanceScore { get; set; }
    public CompanyStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
}

public abstract class CompanyRequestValidatorBase<T> : AbstractValidator<T>
    where T : CompanyRequestBase
{
    protected CompanyRequestValidatorBase()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(200);

        RuleFor(x => x.Email)
            .ValidEmailAddress();

        RuleFor(x => x.Phone)
            .MaximumLength(20)
            .When(x => !string.IsNullOrWhiteSpace(x.Phone));

        RuleFor(x => x.Address)
            .MaximumLength(500)
            .When(x => !string.IsNullOrWhiteSpace(x.Address));

        RuleFor(x => x.TaxNumber)
            .MaximumLength(50)
            .When(x => !string.IsNullOrWhiteSpace(x.TaxNumber));

        RuleFor(x => x.Type)
            .IsInEnum()
            .WithMessage("Type must be Supplier, Buyer, or Both.");

        RuleFor(x => x.CreditLimit)
            .GreaterThanOrEqualTo(0)
            .When(x => x.CreditLimit.HasValue);

        RuleFor(x => x.PaymentTerm)
            .MaximumLength(50)
            .When(x => !string.IsNullOrWhiteSpace(x.PaymentTerm));

        RuleFor(x => x.DiscountRate)
            .InclusiveBetween(0, 100)
            .When(x => x.DiscountRate.HasValue)
            .WithMessage("DiscountRate must be between 0 and 100.");

        RuleFor(x => x.TotalSpend)
            .GreaterThanOrEqualTo(0)
            .When(x => x.TotalSpend.HasValue);

        RuleFor(x => x.TotalSales)
            .GreaterThanOrEqualTo(0)
            .When(x => x.TotalSales.HasValue);

        RuleFor(x => x.OutstandingBalance)
            .GreaterThanOrEqualTo(0)
            .When(x => x.OutstandingBalance.HasValue);

        RuleFor(x => x.PerformanceScore)
            .InclusiveBetween(0, 5)
            .When(x => x.PerformanceScore.HasValue)
            .WithMessage("PerformanceScore must be between 0 and 5.");

        RuleFor(x => x.Status)
            .IsInEnum()
            .WithMessage("Status must be Active, PendingReview, or Inactive.");
    }
}

public class CreateCompanyRequestValidator : CompanyRequestValidatorBase<CreateCompanyRequest>;

public class UpdateCompanyRequestValidator : CompanyRequestValidatorBase<UpdateCompanyRequest>;
