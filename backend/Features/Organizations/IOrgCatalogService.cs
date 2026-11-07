using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface IOrgCatalogService
{
    Task EnsureDefaultsAsync(Guid organizationId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<OrganizationRoleResponse>> ListRolesAsync(
        bool includeInactive = false,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<OrganizationDepartmentResponse>> ListDepartmentsAsync(
        bool includeInactive = false,
        CancellationToken cancellationToken = default);

    Task<(OrganizationRoleResponse? Role, string? Error)> CreateRoleAsync(
        UpsertOrganizationRoleRequest request,
        CancellationToken cancellationToken = default);

    Task<(OrganizationRoleResponse? Role, string? Error)> UpdateRoleAsync(
        Guid id,
        UpsertOrganizationRoleRequest request,
        CancellationToken cancellationToken = default);

    Task<(bool Ok, string? Error)> DeleteRoleAsync(Guid id, CancellationToken cancellationToken = default);

    Task<(OrganizationDepartmentResponse? Department, string? Error)> CreateDepartmentAsync(
        UpsertOrganizationDepartmentRequest request,
        CancellationToken cancellationToken = default);

    Task<(OrganizationDepartmentResponse? Department, string? Error)> UpdateDepartmentAsync(
        Guid id,
        UpsertOrganizationDepartmentRequest request,
        CancellationToken cancellationToken = default);

    Task<(bool Ok, string? Error)> DeleteDepartmentAsync(Guid id, CancellationToken cancellationToken = default);

    Task<OrganizationRole?> GetRoleAsync(Guid organizationId, Guid roleId, CancellationToken cancellationToken = default);

    Task<OrganizationDepartment?> GetDepartmentAsync(
        Guid organizationId,
        Guid departmentId,
        CancellationToken cancellationToken = default);

    Task<OrganizationRole> RequireRoleAsync(Guid organizationId, UserRole privilege, CancellationToken cancellationToken = default);
}
