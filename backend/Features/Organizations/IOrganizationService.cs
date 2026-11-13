using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public interface IOrganizationService
{
    Task<IReadOnlyList<OrganizationSummary>> ListMineAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<(OrganizationSummary? Org, string? Error)> CreateAsync(
        Guid userId,
        CreateOrganizationRequest request,
        CancellationToken cancellationToken = default);

    Task<(SwitchOrganizationResponse? Result, string? Error)> SwitchAsync(
        Guid userId,
        Guid organizationId,
        string password,
        CancellationToken cancellationToken = default);

    Task<(UserResponse? Member, string? Error)> AddExistingMemberAsync(
        AddExistingMemberRequest request,
        CancellationToken cancellationToken = default);

    Task<(bool Ok, string? Error)> SetMembershipStatusAsync(
        Guid membershipId,
        MembershipStatus status,
        CancellationToken cancellationToken = default);

    Task<(InvitationResponse? Invitation, string? Error)> CreateInvitationAsync(
        CreateInvitationRequest request,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<InvitationResponse>> ListInvitationsAsync(
        CancellationToken cancellationToken = default);

    Task<(bool Ok, string? Error)> RevokeInvitationAsync(
        Guid invitationId,
        CancellationToken cancellationToken = default);

    Task<(UserResponse? Member, string? Error)> AcceptInvitationAsync(
        AcceptInvitationRequest request,
        Guid? actingUserId,
        CancellationToken cancellationToken = default);

    Task<OrganizationSettingsResponse?> GetSettingsAsync(CancellationToken cancellationToken = default);

    Task<(OrganizationSettingsResponse? Settings, string? Error)> UpdateSettingsAsync(
        UpdateOrganizationSettingsRequest request,
        CancellationToken cancellationToken = default);
}
