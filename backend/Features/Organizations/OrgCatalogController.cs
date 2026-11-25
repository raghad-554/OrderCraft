using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Tenancy;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[Route("api/org-catalog")]
public class OrgCatalogController : ControllerBase
{
    private readonly IOrgCatalogService _catalog;

    public OrgCatalogController(IOrgCatalogService catalog)
    {
        _catalog = catalog;
    }

    [HttpGet("roles")]
    public async Task<IActionResult> ListRoles(
        [FromQuery] bool includeInactive = false,
        CancellationToken cancellationToken = default) =>
        Ok(await _catalog.ListRolesAsync(includeInactive, cancellationToken));

    [HttpPost("roles")]
    [RequirePage("roles")]
    public async Task<IActionResult> CreateRole(
        [FromBody] UpsertOrganizationRoleRequest request,
        CancellationToken cancellationToken)
    {
        var (role, error) = await _catalog.CreateRoleAsync(request, cancellationToken);
        if (error is not null)
            return BadRequest(new { message = error });
        return Ok(role);
    }

    [HttpPut("roles/{id:guid}")]
    [RequirePage("roles")]
    public async Task<IActionResult> UpdateRole(
        Guid id,
        [FromBody] UpsertOrganizationRoleRequest request,
        CancellationToken cancellationToken)
    {
        var (role, error) = await _catalog.UpdateRoleAsync(id, request, cancellationToken);
        if (error == "Role not found.")
            return NotFound(new { message = error });
        if (error is not null)
            return BadRequest(new { message = error });
        return Ok(role);
    }

    [HttpDelete("roles/{id:guid}")]
    [RequirePage("roles")]
    public async Task<IActionResult> DeleteRole(Guid id, CancellationToken cancellationToken)
    {
        var (ok, error) = await _catalog.DeleteRoleAsync(id, cancellationToken);
        if (!ok)
            return BadRequest(new { message = error });
        return NoContent();
    }

    [HttpGet("departments")]
    public async Task<IActionResult> ListDepartments(
        [FromQuery] bool includeInactive = false,
        CancellationToken cancellationToken = default) =>
        Ok(await _catalog.ListDepartmentsAsync(includeInactive, cancellationToken));

    [HttpPost("departments")]
    [RequirePage("roles")]
    public async Task<IActionResult> CreateDepartment(
        [FromBody] UpsertOrganizationDepartmentRequest request,
        CancellationToken cancellationToken)
    {
        var (department, error) = await _catalog.CreateDepartmentAsync(request, cancellationToken);
        if (error is not null)
            return BadRequest(new { message = error });
        return Ok(department);
    }

    [HttpPut("departments/{id:guid}")]
    [RequirePage("roles")]
    public async Task<IActionResult> UpdateDepartment(
        Guid id,
        [FromBody] UpsertOrganizationDepartmentRequest request,
        CancellationToken cancellationToken)
    {
        var (department, error) = await _catalog.UpdateDepartmentAsync(id, request, cancellationToken);
        if (error == "Department not found.")
            return NotFound(new { message = error });
        if (error is not null)
            return BadRequest(new { message = error });
        return Ok(department);
    }

    [HttpDelete("departments/{id:guid}")]
    [RequirePage("roles")]
    public async Task<IActionResult> DeleteDepartment(Guid id, CancellationToken cancellationToken)
    {
        var (ok, error) = await _catalog.DeleteDepartmentAsync(id, cancellationToken);
        if (!ok)
            return BadRequest(new { message = error });
        return NoContent();
    }
}
