using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Auth;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[RequirePage("employees")]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;

    public UsersController(IUserService userService)
    {
        _userService = userService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? name,
        CancellationToken cancellationToken)
    {
        return Ok(await _userService.GetAllAsync(name, cancellationToken));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var user = await _userService.GetByIdAsync(id, cancellationToken);

        if (user is null)
            return NotFound(new { message = "User not found." });

        return Ok(user);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string name,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Query parameter 'name' is required." });

        return Ok(await _userService.SearchByNameAsync(name, cancellationToken));
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateUserRequest request,
        CancellationToken cancellationToken)
    {
        var (user, conflictMessage) = await _userService.CreateAsync(request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return CreatedAtAction(nameof(GetById), new { id = user!.Id }, user);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateUserRequest request,
        CancellationToken cancellationToken)
    {
        var (user, conflictMessage) = await _userService.UpdateAsync(id, request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        if (user is null)
            return NotFound(new { message = "User not found." });

        return Ok(user);
    }

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken cancellationToken)
    {
        var ok = await _userService.SetActiveAsync(id, isActive: false, cancellationToken);
        return ok
            ? NoContent()
            : NotFound(new { message = "User not found." });
    }

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id, CancellationToken cancellationToken)
    {
        var ok = await _userService.SetActiveAsync(id, isActive: true, cancellationToken);
        return ok
            ? NoContent()
            : NotFound(new { message = "User not found." });
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(
        Guid id,
        [FromBody] ResetPasswordRequest? request,
        CancellationToken cancellationToken)
    {
        var (result, error) = await _userService.ResetPasswordAsync(
            id,
            request ?? new ResetPasswordRequest(),
            cancellationToken);

        if (error == "User not found.")
            return NotFound(new { message = error });

        if (error is not null)
            return BadRequest(new { message = error });

        return Ok(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id, CancellationToken cancellationToken)
    {
        var deleted = await _userService.SoftDeleteAsync(id, cancellationToken);

        if (!deleted)
            return NotFound(new { message = "User not found." });

        return NoContent();
    }
}
