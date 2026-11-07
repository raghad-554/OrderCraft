using OrderCraft.Models;

namespace OrderCraft.Services;

/// <summary>
/// Purchase order lifecycle.
/// Transitions:
///   Draft → Pending (submit), Cancelled.
///   Pending → Approved, Rejected (reason required in OrderService), Cancelled.
///   Rejected → Pending (resubmit), Cancelled.
///   Approved → Shipped, Cancelled.
///   Shipped → Delivered.
///   Delivered / Cancelled are terminal. Cancel is not allowed after Shipped.
/// Edit: Draft and Rejected only (CanEditDetails). Draft save stays Draft unless submitted
/// to Pending. Rejected save always resubmits to Pending (OrderService.UpdateAsync).
/// Pending / Approved / Shipped / Delivered / Cancelled are not editable.
/// SoD: a non-admin creator cannot Pending → Approved. Org Admin may. Enforced in OrderService.
/// RejectionReason is required on Pending → Rejected, kept until Approved, then cleared.
/// </summary>
public static class OrderStateMachine
{
    private static readonly Dictionary<OrderStatus, OrderStatus[]> Allowed = new()
    {
        [OrderStatus.Draft] = [OrderStatus.Pending, OrderStatus.Cancelled],
        [OrderStatus.Pending] = [OrderStatus.Approved, OrderStatus.Rejected, OrderStatus.Cancelled],
        [OrderStatus.Rejected] = [OrderStatus.Pending, OrderStatus.Cancelled],
        [OrderStatus.Approved] = [OrderStatus.Shipped, OrderStatus.Cancelled],
        [OrderStatus.Shipped] = [OrderStatus.Delivered],
        [OrderStatus.Delivered] = [],
        [OrderStatus.Cancelled] = []
    };

    public static bool CanTransition(OrderStatus from, OrderStatus to)
    {
        if (from == to)
            return true;

        return Allowed.TryGetValue(from, out var next) && next.Contains(to);
    }

    public static bool CanEditDetails(OrderStatus status) =>
        status is OrderStatus.Draft or OrderStatus.Rejected;

    public static string? TransitionError(OrderStatus from, OrderStatus to)
    {
        if (CanTransition(from, to))
            return null;

        return $"Cannot change purchase order status from {from} to {to}.";
    }
}
