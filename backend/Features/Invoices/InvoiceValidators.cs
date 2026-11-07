using FluentValidation;
using OrderCraft.Models;

namespace OrderCraft.Schemas;

public abstract class InvoiceRequestBase
{
    public string InvoiceNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public InvoiceStatus Status { get; set; } = InvoiceStatus.Unpaid;
    public DateTime DueDate { get; set; }
}

public class CreateInvoiceRequest : InvoiceRequestBase
{
    public Guid OrderId { get; set; }
}

public class UpdateInvoiceRequest : InvoiceRequestBase;

public class RecordPaymentRequest
{
    public decimal Amount { get; set; }
}

public class InvoiceResponse
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public string? OrderNumber { get; set; }
    public string? BuyerCompanyName { get; set; }
    public string? SupplierCompanyName { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public string Currency { get; set; } = "USD";
    public decimal Amount { get; set; }
    public decimal AmountPaid { get; set; }
    public decimal Outstanding { get; set; }
    public InvoiceStatus Status { get; set; }
    public DateTime DueDate { get; set; }
}

public abstract class InvoiceRequestValidatorBase<T> : AbstractValidator<T>
    where T : InvoiceRequestBase
{
    protected InvoiceRequestValidatorBase()
    {
        RuleFor(x => x.InvoiceNumber)
            .NotEmpty()
            .MaximumLength(50);

        RuleFor(x => x.Amount)
            .GreaterThan(0)
            .WithMessage("Amount must be greater than 0.");

        RuleFor(x => x.Status)
            .IsInEnum()
            .WithMessage("Status must be Paid, Unpaid, PartiallyPaid, or Overdue.");

        RuleFor(x => x.DueDate)
            .NotEmpty()
            .WithMessage("DueDate is required.");
    }
}

public class CreateInvoiceRequestValidator : InvoiceRequestValidatorBase<CreateInvoiceRequest>
{
    public CreateInvoiceRequestValidator()
    {
        RuleFor(x => x.OrderId)
            .NotEmpty()
            .WithMessage("OrderId is required.");
    }
}

public class UpdateInvoiceRequestValidator : InvoiceRequestValidatorBase<UpdateInvoiceRequest>;
