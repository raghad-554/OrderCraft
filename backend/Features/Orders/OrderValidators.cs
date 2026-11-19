using FluentValidation;
using OrderCraft.Models;

namespace OrderCraft.Schemas;

public abstract class OrderRequestBase
{
    public string OrderNumber { get; set; } = string.Empty;
    public OrderDirection Direction { get; set; } = OrderDirection.Purchase;
    public Guid PartnerCompanyId { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public decimal TotalAmount { get; set; }
    public DateTime? DeliveryDate { get; set; }
    public PaymentTerms? PaymentTerms { get; set; }
    public decimal TaxRate { get; set; }
    public string? Notes { get; set; }
}

public class CreateOrderRequest : OrderRequestBase
{
    public DateTime? OrderDate { get; set; }
    public List<CreateOrderItemRequest> OrderItems { get; set; } = new();
}

public class UpdateOrderRequest : OrderRequestBase
{
    public DateTime OrderDate { get; set; }
    public List<CreateOrderItemRequest>? OrderItems { get; set; }
}

public class OrderItemResponse
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public string? ProductName { get; set; }
    public string? ProductSku { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TotalPrice { get; set; }
}

public class OrderResponse
{
    public Guid Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public OrderDirection Direction { get; set; }
    public Guid? PartnerCompanyId { get; set; }
    public Guid? BuyerCompanyId { get; set; }
    public string? BuyerCompanyName { get; set; }
    public Guid? SupplierCompanyId { get; set; }
    public string? SupplierCompanyName { get; set; }
    public Guid CreatedByUserId { get; set; }
    public OrderStatus Status { get; set; }
    public decimal TotalAmount { get; set; }
    public string? Currency { get; set; }
    public decimal TaxRate { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal SubtotalAmount { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal ApprovalThreshold { get; set; }
    public DateTime OrderDate { get; set; }
    public DateTime? DeliveryDate { get; set; }
    public PaymentTerms? PaymentTerms { get; set; }
    public string? Notes { get; set; }
    public string? RejectionReason { get; set; }
    public Guid? InvoiceId { get; set; }
    public string? InvoiceNumber { get; set; }
    public decimal InvoicedAmount { get; set; }
    public decimal UninvoicedAmount { get; set; }
    public InvoiceStatus? PaymentStatus { get; set; }
    public List<OrderItemResponse> OrderItems { get; set; } = new();
}

public class OrderFieldChangeResponse
{
    public Guid Id { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string Field { get; set; } = string.Empty;
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class UpdateOrderStatusRequest
{
    public OrderStatus Status { get; set; }
    public string? RejectionReason { get; set; }
}

public class UpdateOrderStatusRequestValidator : AbstractValidator<UpdateOrderStatusRequest>
{
    public UpdateOrderStatusRequestValidator()
    {
        RuleFor(x => x.Status)
            .IsInEnum()
            .WithMessage("Status must be Draft, Pending, Rejected, Approved, Shipped, Delivered, or Cancelled.");

        RuleFor(x => x.RejectionReason)
            .MaximumLength(1000)
            .When(x => !string.IsNullOrWhiteSpace(x.RejectionReason));
    }
}

public abstract class OrderRequestValidatorBase<T> : AbstractValidator<T>
    where T : OrderRequestBase
{
    protected OrderRequestValidatorBase()
    {
        RuleFor(x => x.OrderNumber)
            .NotEmpty()
            .MaximumLength(50);

        RuleFor(x => x.Direction)
            .IsInEnum()
            .WithMessage("Direction must be Purchase or Sale.");

        RuleFor(x => x.PartnerCompanyId)
            .NotEmpty()
            .WithMessage("PartnerCompanyId is required.");

        RuleFor(x => x.Status)
            .IsInEnum()
            .WithMessage("Status must be Draft, Pending, Rejected, Approved, Shipped, Delivered, or Cancelled.");

        RuleFor(x => x.TotalAmount)
            .GreaterThanOrEqualTo(0)
            .WithMessage("TotalAmount cannot be negative.");

        RuleFor(x => x.TaxRate)
            .InclusiveBetween(0, 100)
            .WithMessage("TaxRate must be between 0 and 100.");

        RuleFor(x => x.PaymentTerms)
            .IsInEnum()
            .When(x => x.PaymentTerms.HasValue)
            .WithMessage("PaymentTerms must be Net30, Net60, or Immediate.");

        RuleFor(x => x.Notes)
            .MaximumLength(1000)
            .When(x => !string.IsNullOrWhiteSpace(x.Notes));
    }
}

public class CreateOrderRequestValidator : OrderRequestValidatorBase<CreateOrderRequest>
{
    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.OrderItems)
            .NotEmpty()
            .WithMessage("Order must contain at least one item.");

        RuleForEach(x => x.OrderItems)
            .SetValidator(new CreateOrderItemRequestValidator());
    }
}

public class UpdateOrderRequestValidator : OrderRequestValidatorBase<UpdateOrderRequest>
{
    public UpdateOrderRequestValidator()
    {
        RuleFor(x => x.OrderDate)
            .NotEmpty();

        RuleForEach(x => x.OrderItems)
            .SetValidator(new CreateOrderItemRequestValidator())
            .When(x => x.OrderItems is { Count: > 0 });
    }
}
