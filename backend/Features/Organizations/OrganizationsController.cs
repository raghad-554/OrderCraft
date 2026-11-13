using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Auth;
using OrderCraft.Models;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class OrganizationsController : ControllerBase
{
    private readonly IOrganizationService _organizationService;

    public OrganizationsController(IOrganizationService organizationService)
    {
        _organizationService = organizationService;
    }

    [HttpGet("mine")]
    [AllowNoOrganization]
    public async Task<IActionResult> Mine(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized(new { message = "Invalid token." });

        return Ok(await _organizationService.ListMineAsync(userId, cancellationToken));
    }

    [HttpPost]
    [AllowNoOrganization]
    public async Task<IActionResult> Create(
        [FromBody] CreateOrganizationRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized(new { message = "Invalid token." });

        var (org, error) = await _organizationService.CreateAsync(userId, request, cancellationToken);
        if (error is not null)
            return StatusCode(StatusCodes.Status403Forbidden, new { message = error });

        return Ok(org);
    }

    [HttpPost("{id:guid}/switch")]
    [AllowNoOrganization]
    public async Task<IActionResult> Switch(
        Guid id,
        [FromBody] SwitchOrganizationRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized(new { message = "Invalid token." });

        var (result, error) = await _organizationService.SwitchAsync(
            userId,
            id,
            request.Password,
            cancellationToken);
        if (error == "Organization not found.")
            return NotFound(new { message = error });
        if (error is not null)
            return BadRequest(new { message = error });

        return Ok(result);
    }

    [HttpGet("settings")]
    [RequirePage("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken cancellationToken)
    {
        var settings = await _organizationService.GetSettingsAsync(cancellationToken);
        return settings is null
            ? NotFound(new { message = "Organization not found." })
            : Ok(settings);
    }

    [HttpPut("settings")]
    [RequirePage("settings")]
    public async Task<IActionResult> UpdateSettings(
        [FromBody] UpdateOrganizationSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var (settings, error) = await _organizationService.UpdateSettingsAsync(request, cancellationToken);
        if (error == "Organization not found.")
            return NotFound(new { message = error });
        if (error is not null)
            return StatusCode(StatusCodes.Status403Forbidden, new { message = error });

        return Ok(settings);
    }

    [HttpPost("members")]
    [RequirePage("employees")]
    public async Task<IActionResult> AddExistingMember(
        [FromBody] AddExistingMemberRequest request,
        CancellationToken cancellationToken)
    {
        var (member, error) = await _organizationService.AddExistingMemberAsync(request, cancellationToken);
        if (error is not null)
            return BadRequest(new { message = error });

        return Ok(member);
    }

    [HttpPost("members/{membershipId:guid}/suspend")]
    [RequirePage("employees")]
    public async Task<IActionResult> Suspend(Guid membershipId, CancellationToken cancellationToken)
    {
        var (ok, error) = await _organizationService.SetMembershipStatusAsync(
            membershipId,
            MembershipStatus.Suspended,
            cancellationToken);
        if (!ok)
            return BadRequest(new { message = error });

        return NoContent();
    }

    [HttpPost("members/{membershipId:guid}/activate")]
    [RequirePage("employees")]
    public async Task<IActionResult> Activate(Guid membershipId, CancellationToken cancellationToken)
    {
        var (ok, error) = await _organizationService.SetMembershipStatusAsync(
            membershipId,
            MembershipStatus.Active,
            cancellationToken);
        if (!ok)
            return BadRequest(new { message = error });

        return NoContent();
    }

    [HttpPost("members/{membershipId:guid}/revoke")]
    [RequirePage("employees")]
    public async Task<IActionResult> RevokeMember(Guid membershipId, CancellationToken cancellationToken)
    {
        var (ok, error) = await _organizationService.SetMembershipStatusAsync(
            membershipId,
            MembershipStatus.Revoked,
            cancellationToken);
        if (!ok)
            return BadRequest(new { message = error });

        return NoContent();
    }

    [HttpGet("invitations")]
    [RequirePage("employees")]
    public async Task<IActionResult> ListInvitations(CancellationToken cancellationToken)
    {
        return Ok(await _organizationService.ListInvitationsAsync(cancellationToken));
    }

    [HttpPost("invitations")]
    [RequirePage("employees")]
    public async Task<IActionResult> CreateInvitation(
        [FromBody] CreateInvitationRequest request,
        CancellationToken cancellationToken)
    {
        var (invitation, error) = await _organizationService.CreateInvitationAsync(request, cancellationToken);
        if (error is not null)
            return BadRequest(new { message = error });

        return Ok(invitation);
    }

    [HttpPost("invitations/{invitationId:guid}/revoke")]
    [RequirePage("employees")]
    public async Task<IActionResult> RevokeInvitation(Guid invitationId, CancellationToken cancellationToken)
    {
        var (ok, error) = await _organizationService.RevokeInvitationAsync(invitationId, cancellationToken);
        if (!ok)
            return BadRequest(new { message = error });

        return NoContent();
    }

    [HttpPost("invitations/accept")]
    [AllowAnonymous]
    [AllowNoOrganization]
    public async Task<IActionResult> AcceptInvitation(
        [FromBody] AcceptInvitationRequest request,
        CancellationToken cancellationToken)
    {
        Guid? actingUserId = TryGetUserId(out var userId) ? userId : null;
        var (member, error) = await _organizationService.AcceptInvitationAsync(
            request,
            actingUserId,
            cancellationToken);
        if (error is not null)
            return BadRequest(new { message = error });

        return Ok(member);
    }

    private bool TryGetUserId(out Guid userId)
    {
        var raw =
            User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return Guid.TryParse(raw, out userId);
    }
}
