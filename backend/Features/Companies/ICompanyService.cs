using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface ICompanyService
{
    Task<IReadOnlyList<CompanyResponse>> GetAllAsync(
        CompanyType[]? types = null,
        string? name = null,
        CancellationToken cancellationToken = default);

    Task<CompanyResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CompanyResponse>> SearchByNameAsync(
        string name,
        CancellationToken cancellationToken = default);
    Task<(CompanyResponse? Company, string? ConflictMessage)> CreateAsync(CreateCompanyRequest request, CancellationToken cancellationToken = default);
    Task<(CompanyResponse? Company, string? ConflictMessage)> UpdateAsync(Guid id, UpdateCompanyRequest request, CancellationToken cancellationToken = default);
    Task<(bool Deleted, string? ErrorMessage)> SoftDeleteAsync(
        Guid id,
        CancellationToken cancellationToken = default);
}
