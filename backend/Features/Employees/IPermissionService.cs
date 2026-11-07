using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface IPermissionService
{
    IReadOnlyList<PageCatalogItemResponse> GetCatalog();

    Task<UserPermissionsResponse?> GetUserPermissionsAsync(
        Guid userId,
        Guid? organizationId = null,
        CancellationToken cancellationToken = default);

    Task<(UserPermissionsResponse? Result, string? Error)> UpdateUserPermissionsAsync(
        Guid userId,
        UpdateUserPermissionsRequest request,
        CancellationToken cancellationToken = default);

    Task<UserPermissionsResponse?> GetMyPermissionsAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<bool> HasAccessAsync(
        Guid userId,
        Guid organizationId,
        string pageKey,
        PageAccessLevel required,
        CancellationToken cancellationToken = default);
}
