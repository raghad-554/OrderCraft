using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Auth;
using OrderCraft.Models;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[RequirePage("companies")]
[Route("api/[controller]")]
public class CompaniesController : ControllerBase
{
    private readonly ICompanyService _companyService;

    public CompaniesController(ICompanyService companyService)
    {
        _companyService = companyService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? type,
        [FromQuery] string? name,
        CancellationToken cancellationToken)
    {
        CompanyType[]? types = null;
        if (!string.IsNullOrWhiteSpace(type))
        {
            var parts = type.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var parsed = new List<CompanyType>();
            foreach (var part in parts)
            {
                if (!Enum.TryParse<CompanyType>(part, ignoreCase: true, out var value))
                    return BadRequest(new { message = $"Invalid company type '{part}'." });
                parsed.Add(value);
            }

            types = parsed.ToArray();
        }

        return Ok(await _companyService.GetAllAsync(types, name, cancellationToken));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var company = await _companyService.GetByIdAsync(id, cancellationToken);
        return company is null
            ? NotFound(new { message = "Company not found." })
            : Ok(company);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string name,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Query parameter 'name' is required." });

        return Ok(await _companyService.SearchByNameAsync(name, cancellationToken));
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateCompanyRequest request,
        CancellationToken cancellationToken)
    {
        var (company, conflictMessage) = await _companyService.CreateAsync(request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return CreatedAtAction(nameof(GetById), new { id = company!.Id }, company);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateCompanyRequest request,
        CancellationToken cancellationToken)
    {
        var (company, conflictMessage) = await _companyService.UpdateAsync(id, request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return company is null
            ? NotFound(new { message = "Company not found." })
            : Ok(company);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id, CancellationToken cancellationToken)
    {
        var (deleted, error) = await _companyService.SoftDeleteAsync(id, cancellationToken);
        if (error is not null)
            return Conflict(new { message = error });

        return deleted
            ? NoContent()
            : NotFound(new { message = "Company not found." });
    }
}
