using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface IProductService
{
    Task<IReadOnlyList<ProductResponse>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<ProductResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ProductResponse>> SearchByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<(ProductResponse? Product, string? ConflictMessage)> CreateAsync(CreateProductRequest request, CancellationToken cancellationToken = default);
    Task<(ProductResponse? Product, string? ConflictMessage)> UpdateAsync(Guid id, UpdateProductRequest request, CancellationToken cancellationToken = default);
    Task<(bool Deleted, string? ErrorMessage)> SoftDeleteAsync(
        Guid id,
        CancellationToken cancellationToken = default);
}
