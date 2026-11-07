using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Auth;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[RequirePage("purchaseOrders")]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly IOrderService _orderService;

    public OrdersController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        return Ok(await _orderService.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var order = await _orderService.GetByIdAsync(id, cancellationToken);
        return order is null
            ? NotFound(new { message = "Order not found." })
            : Ok(order);
    }

    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> History(Guid id, CancellationToken cancellationToken)
    {
        var history = await _orderService.GetHistoryAsync(id, cancellationToken);
        return history is null
            ? NotFound(new { message = "Order not found." })
            : Ok(history);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string orderNumber,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(orderNumber))
            return BadRequest(new { message = "Query parameter 'orderNumber' is required." });

        return Ok(await _orderService.SearchByOrderNumberAsync(orderNumber, cancellationToken));
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateOrderRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var createdByUserId))
            return Unauthorized(new { message = "Authenticated user id is missing from the token." });

        var (order, conflictMessage) = await _orderService.CreateAsync(
            request,
            createdByUserId,
            cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return CreatedAtAction(nameof(GetById), new { id = order!.Id }, order);
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var value =
            User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        return Guid.TryParse(value, out userId);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateOrderRequest request,
        CancellationToken cancellationToken)
    {
        var (order, conflictMessage) = await _orderService.UpdateAsync(id, request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return order is null
            ? NotFound(new { message = "Order not found." })
            : Ok(order);
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(
        Guid id,
        [FromBody] UpdateOrderStatusRequest request,
        CancellationToken cancellationToken)
    {
        var (order, error) = await _orderService.UpdateStatusAsync(
            id,
            request.Status,
            request.RejectionReason,
            cancellationToken);
        if (error is not null)
            return Conflict(new { message = error });

        return order is null
            ? NotFound(new { message = "Order not found." })
            : Ok(order);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id, CancellationToken cancellationToken)
    {
        var deleted = await _orderService.SoftDeleteAsync(id, cancellationToken);
        return deleted
            ? NoContent()
            : NotFound(new { message = "Order not found." });
    }
}
