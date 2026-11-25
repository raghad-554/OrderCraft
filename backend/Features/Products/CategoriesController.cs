using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Tenancy;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[RequirePage("companies")]
[Route("api/[controller]")]
public class CategoriesController : ControllerBase
{
    private readonly ICategoryService _categoryService;

    public CategoriesController(ICategoryService categoryService)
    {
        _categoryService = categoryService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        return Ok(await _categoryService.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var category = await _categoryService.GetByIdAsync(id, cancellationToken);
        return category is null
            ? NotFound(new { message = "Category not found." })
            : Ok(category);
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateCategoryRequest request,
        CancellationToken cancellationToken)
    {
        var (category, conflictMessage) = await _categoryService.CreateAsync(request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return CreatedAtAction(nameof(GetById), new { id = category!.Id }, category);
    }
}
