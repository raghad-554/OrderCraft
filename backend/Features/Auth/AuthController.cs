using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Auth;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[AllowNoOrganization]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IAuthCookieService _authCookies;

    public AuthController(IAuthService authService, IAuthCookieService authCookies)
    {
        _authService = authService;
        _authCookies = authCookies;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _authService.LoginAsync(request, cancellationToken);

        if (result is null)
        {
            return Unauthorized(new { message = "Invalid username or password" });
        }

        _authCookies.SetAuthCookie(HttpContext, result.Token, request.RememberMe);
        // Keep JWT in HttpOnly cookie only — do not expose it to browser JS.
        result.Token = string.Empty;
        return Ok(result);
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        await _authService.LogoutAsync(cancellationToken);
        _authCookies.ClearAuthCookie(HttpContext);
        return NoContent();
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var error = await _authService.ChangePasswordAsync(request, cancellationToken);
        if (error is not null)
            return BadRequest(new { message = error });

        return NoContent();
    }
}
