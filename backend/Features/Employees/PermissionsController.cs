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
public class PermissionsController : ControllerBase
{
    private readonly IPermissionService _permissionService;

    public PermissionsController(IPermissionService permissionService)
    {
        _permissionService = permissionService;
    }

    [HttpGet("catalog")]
    [AllowNoOrganization]
    public IActionResult GetCatalog() => Ok(_permissionService.GetCatalog());

    [HttpGet("me")]
    [AllowNoOrganization]
    public async Task<IActionResult> GetMine(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
            return Unauthorized(new { message = "Invalid token." });

        var result = await _permissionService.GetMyPermissionsAsync(userId.Value, cancellationToken);
        return Ok(result ?? new UserPermissionsResponse
        {
            UserId = userId.Value,
            Permissions = []
        });
    }

    [HttpGet("users/{userId:guid}")]
    [RequirePage("roles")]
    public async Task<IActionResult> GetUserPermissions(Guid userId, CancellationToken cancellationToken)
    {
        var result = await _permissionService.GetUserPermissionsAsync(userId, cancellationToken: cancellationToken);
        return result is null
            ? NotFound(new { message = "User not found." })
            : Ok(result);
    }

    [HttpPut("users/{userId:guid}")]
    [RequirePage("roles")]
    public async Task<IActionResult> UpdateUserPermissions(
        Guid userId,
        [FromBody] UpdateUserPermissionsRequest request,
        CancellationToken cancellationToken)
    {
        var (result, error) = await _permissionService.UpdateUserPermissionsAsync(
            userId,
            request,
            cancellationToken);

        if (error == "User not found.")
            return NotFound(new { message = error });

        if (error is not null)
            return BadRequest(new { message = error });

        return Ok(result);
    }

    private Guid? GetUserId()
    {
        var raw =
            User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        return Guid.TryParse(raw, out var id) ? id : null;
    }

    private bool IsAdminCaller()
    {
        var roles = User.FindAll(ClaimTypes.Role)
            .Concat(User.FindAll("role"))
            .Select(c => c.Value);

        return roles.Any(role =>
            string.Equals(role, nameof(UserRole.Admin), StringComparison.OrdinalIgnoreCase));
    }
}
