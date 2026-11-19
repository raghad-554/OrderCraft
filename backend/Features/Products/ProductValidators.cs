using FluentValidation;

namespace OrderCraft.Schemas;

public abstract class ProductRequestBase
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string SKU { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public decimal Price { get; set; }
    public int StockQuantity { get; set; }
    public bool IsActive { get; set; } = true;
}

public class CreateProductRequest : ProductRequestBase
{
    public Guid CompanyId { get; set; }
}

public class UpdateProductRequest : ProductRequestBase
{
    public Guid CompanyId { get; set; }
}

public class ProductResponse
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public string? CompanyName { get; set; }
    public Guid? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string SKU { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string? Currency { get; set; }
    public int StockQuantity { get; set; }
    public bool IsActive { get; set; }
}

public abstract class ProductRequestValidatorBase<T> : AbstractValidator<T>
    where T : ProductRequestBase
{
    protected ProductRequestValidatorBase()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(200);

        RuleFor(x => x.Description)
            .MaximumLength(1000)
            .When(x => !string.IsNullOrWhiteSpace(x.Description));

        RuleFor(x => x.SKU)
            .NotEmpty()
            .MaximumLength(50);

        RuleFor(x => x.Price)
            .GreaterThan(0)
            .WithMessage("Price must be greater than 0.");

        RuleFor(x => x.StockQuantity)
            .GreaterThanOrEqualTo(0)
            .WithMessage("StockQuantity cannot be negative.");
    }
}

public class CreateProductRequestValidator : ProductRequestValidatorBase<CreateProductRequest>
{
    public CreateProductRequestValidator()
    {
        RuleFor(x => x.CompanyId)
            .NotEmpty()
            .WithMessage("CompanyId (vendor) is required.");
    }
}

public class UpdateProductRequestValidator : ProductRequestValidatorBase<UpdateProductRequest>
{
    public UpdateProductRequestValidator()
    {
        RuleFor(x => x.CompanyId)
            .NotEmpty()
            .WithMessage("CompanyId (vendor) is required.");
    }
}
