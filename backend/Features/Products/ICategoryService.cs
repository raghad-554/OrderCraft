using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface ICategoryService
{
    Task<IReadOnlyList<CategoryResponse>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<CategoryResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<(CategoryResponse? Category, string? ConflictMessage)> CreateAsync(
        CreateCategoryRequest request,
        CancellationToken cancellationToken = default);
}
