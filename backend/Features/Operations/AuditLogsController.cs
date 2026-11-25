using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Tenancy;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[RequirePage("auditLog")]
[Route("api/[controller]")]
public class AuditLogsController : ControllerBase
{
    private readonly IAuditService _auditService;

    public AuditLogsController(IAuditService auditService)
    {
        _auditService = auditService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? entityType,
        [FromQuery] string? action,
        [FromQuery] string? search,
        [FromQuery] Guid? employeeId,
        CancellationToken cancellationToken)
    {
        return Ok(await _auditService.GetAllAsync(
            entityType,
            action,
            search,
            employeeId,
            cancellationToken));
    }
}
