using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface IPlatformOrganizationService
{
    IReadOnlyList<PlatformPageCatalogItem> ListPages();

    Task<IReadOnlyList<PlatformOrganizationResponse>> ListAsync(CancellationToken cancellationToken = default);

    Task<PlatformOrganizationResponse?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    Task<(PlatformOrganizationResponse? Org, string? Error)> CreateAsync(
        CreatePlatformOrganizationRequest request,
        CancellationToken cancellationToken = default);

    Task<(PlatformOrganizationResponse? Org, string? Error)> UpdateAsync(
        Guid id,
        UpdatePlatformOrganizationRequest request,
        CancellationToken cancellationToken = default);
}
