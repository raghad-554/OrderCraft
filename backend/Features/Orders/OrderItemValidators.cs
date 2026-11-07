using FluentValidation;
using OrderCraft.Services;

namespace OrderCraft.Schemas;

public abstract class OrderItemRequestBase
{
    public Guid ProductId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TotalPrice { get; set; }
}

public class CreateOrderItemRequest : OrderItemRequestBase
{
    public Guid? OrderId { get; set; }
}

public class UpdateOrderItemRequest : OrderItemRequestBase;

public abstract class OrderItemRequestValidatorBase<T> : AbstractValidator<T>
    where T : OrderItemRequestBase
{
    protected OrderItemRequestValidatorBase()
    {
        RuleFor(x => x.ProductId)
            .NotEmpty()
            .WithMessage("ProductId is required.");

        RuleFor(x => x.Quantity)
            .GreaterThan(0)
            .WithMessage("Quantity must be greater than 0.");

        RuleFor(x => x.UnitPrice)
            .GreaterThan(0)
            .WithMessage("UnitPrice must be greater than 0.");

        RuleFor(x => x.DiscountAmount)
            .GreaterThanOrEqualTo(0)
            .WithMessage("DiscountAmount cannot be negative.")
            .Must((item, discount) => OrderItemPricing.Money(discount) <= OrderItemPricing.LineGross(item))
            .WithMessage("DiscountAmount cannot exceed Quantity * UnitPrice.");

        RuleFor(x => x.TotalPrice)
            .GreaterThanOrEqualTo(0)
            .WithMessage("TotalPrice cannot be negative.")
            .Must((item, total) => OrderItemPricing.Money(total) == OrderItemPricing.LineGross(item) - OrderItemPricing.Money(item.DiscountAmount))
            .WithMessage("TotalPrice must equal Quantity * UnitPrice - DiscountAmount.");
    }
}

public class CreateOrderItemRequestValidator : OrderItemRequestValidatorBase<CreateOrderItemRequest>;

public class UpdateOrderItemRequestValidator : OrderItemRequestValidatorBase<UpdateOrderItemRequest>;

internal static class OrderItemPricing
{
    public static decimal Money(decimal value) =>
        InvoiceMoney.Round(value);

    public static decimal LineGross(OrderItemRequestBase item) =>
        Money(item.Quantity * item.UnitPrice);

    public static (decimal Discount, decimal Total) Price(int quantity, decimal unitPrice, decimal discount)
    {
        var gross = Money(quantity * unitPrice);
        var clamped = Math.Clamp(Money(discount), 0m, gross);
        return (clamped, gross - clamped);
    }
}
