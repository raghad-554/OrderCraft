using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Auth;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[AllowNoOrganization]
[RequirePlatformAdmin]
[Route("api/platform")]
public class PlatformOrganizationsController : ControllerBase
{
    private readonly IPlatformOrganizationService _platform;

    public PlatformOrganizationsController(IPlatformOrganizationService platform)
    {
        _platform = platform;
    }

    [HttpGet("pages")]
    public IActionResult Pages() => Ok(_platform.ListPages());

    [HttpGet("organizations")]
    public async Task<IActionResult> List(CancellationToken cancellationToken) =>
        Ok(await _platform.ListAsync(cancellationToken));

    [HttpGet("organizations/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var org = await _platform.GetAsync(id, cancellationToken);
        return org is null ? NotFound(new { message = "Organization not found." }) : Ok(org);
    }

    [HttpPost("organizations")]
    public async Task<IActionResult> Create(
        [FromBody] CreatePlatformOrganizationRequest request,
        CancellationToken cancellationToken)
    {
        var (org, error) = await _platform.CreateAsync(request, cancellationToken);
        if (error is not null)
            return BadRequest(new { message = error });
        return Ok(org);
    }

    [HttpPut("organizations/{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdatePlatformOrganizationRequest request,
        CancellationToken cancellationToken)
    {
        var (org, error) = await _platform.UpdateAsync(id, request, cancellationToken);
        if (error == "Organization not found.")
            return NotFound(new { message = error });
        if (error is not null)
            return BadRequest(new { message = error });
        return Ok(org);
    }
}
