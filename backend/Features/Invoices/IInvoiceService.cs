using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface IInvoiceService
{
    Task<IReadOnlyList<InvoiceResponse>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<InvoiceResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<InvoiceResponse>> SearchByInvoiceNumberAsync(string invoiceNumber, CancellationToken cancellationToken = default);
    Task<(InvoiceResponse? Invoice, string? ConflictMessage)> CreateAsync(CreateInvoiceRequest request, CancellationToken cancellationToken = default);
    Task<(InvoiceResponse? Invoice, string? ConflictMessage)> CreateFromOrderAsync(Guid orderId, CancellationToken cancellationToken = default);
    Task<(InvoiceResponse? Invoice, string? ConflictMessage)> UpdateAsync(Guid id, UpdateInvoiceRequest request, CancellationToken cancellationToken = default);
    Task<(InvoiceResponse? Invoice, string? Error)> RecordPaymentAsync(Guid id, decimal amount, CancellationToken cancellationToken = default);
    Task<bool> SoftDeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
