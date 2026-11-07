using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface IUserService
{
    Task<IReadOnlyList<UserResponse>> GetAllAsync(
        string? name = null,
        CancellationToken cancellationToken = default);

    Task<UserResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<UserResponse>> SearchByNameAsync(
        string name,
        CancellationToken cancellationToken = default);

    Task<(UserResponse? User, string? ConflictMessage)> CreateAsync(
        CreateUserRequest request,
        CancellationToken cancellationToken = default);

    Task<(UserResponse? User, string? ConflictMessage)> UpdateAsync(
        Guid id,
        UpdateUserRequest request,
        CancellationToken cancellationToken = default);

    Task<bool> SetActiveAsync(Guid id, bool isActive, CancellationToken cancellationToken = default);

    Task<(ResetPasswordResponse? Result, string? ErrorMessage)> ResetPasswordAsync(
        Guid id,
        ResetPasswordRequest request,
        CancellationToken cancellationToken = default);

    Task<bool> SoftDeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
