using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface IOrderService
{
    Task<IReadOnlyList<OrderResponse>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<OrderResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OrderResponse>> SearchByOrderNumberAsync(string orderNumber, CancellationToken cancellationToken = default);
    Task<(OrderResponse? Order, string? ConflictMessage)> CreateAsync(CreateOrderRequest request, Guid createdByUserId, CancellationToken cancellationToken = default);
    Task<(OrderResponse? Order, string? ConflictMessage)> UpdateAsync(Guid id, UpdateOrderRequest request, CancellationToken cancellationToken = default);
    Task<(OrderResponse? Order, string? Error)> UpdateStatusAsync(
        Guid id,
        OrderStatus status,
        string? rejectionReason = null,
        CancellationToken cancellationToken = default);
    Task<bool> SoftDeleteAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OrderFieldChangeResponse>?> GetHistoryAsync(Guid id, CancellationToken cancellationToken = default);
}
