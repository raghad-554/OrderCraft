using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Tenancy;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[RequirePage("invoices")]
[Route("api/[controller]")]
public class InvoicesController : ControllerBase
{
    private readonly IInvoiceService _invoiceService;

    public InvoicesController(IInvoiceService invoiceService)
    {
        _invoiceService = invoiceService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        return Ok(await _invoiceService.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var invoice = await _invoiceService.GetByIdAsync(id, cancellationToken);
        return invoice is null
            ? NotFound(new { message = "Invoice not found." })
            : Ok(invoice);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string invoiceNumber,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(invoiceNumber))
            return BadRequest(new { message = "Query parameter 'invoiceNumber' is required." });

        return Ok(await _invoiceService.SearchByInvoiceNumberAsync(invoiceNumber, cancellationToken));
    }

    [HttpPost("from-order/{orderId:guid}")]
    public async Task<IActionResult> CreateFromOrder(Guid orderId, CancellationToken cancellationToken)
    {
        var (invoice, conflictMessage) = await _invoiceService.CreateFromOrderAsync(orderId, cancellationToken);

        if (conflictMessage == "Order not found.")
            return NotFound(new { message = conflictMessage });

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return Ok(invoice);
    }

    [HttpPost("/api/Orders/{id:guid}/invoice")]
    public Task<IActionResult> GenerateFromOrderRoute(Guid id, CancellationToken cancellationToken) =>
        CreateFromOrder(id, cancellationToken);

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        var (invoice, conflictMessage) = await _invoiceService.CreateAsync(request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return CreatedAtAction(nameof(GetById), new { id = invoice!.Id }, invoice);
    }

    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> RecordPayment(
        Guid id,
        [FromBody] RecordPaymentRequest request,
        CancellationToken cancellationToken)
    {
        var (invoice, error) = await _invoiceService.RecordPaymentAsync(id, request.Amount, cancellationToken);
        if (invoice is null && error is null)
            return NotFound(new { message = "Invoice not found." });
        if (error is not null)
            return Conflict(new { message = error });
        return Ok(invoice);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        var (invoice, conflictMessage) = await _invoiceService.UpdateAsync(id, request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return invoice is null
            ? NotFound(new { message = "Invoice not found." })
            : Ok(invoice);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id, CancellationToken cancellationToken)
    {
        var deleted = await _invoiceService.SoftDeleteAsync(id, cancellationToken);
        return deleted
            ? NoContent()
            : NotFound(new { message = "Invoice not found." });
    }
}
