using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderCraft.Auth;
using OrderCraft.Schemas;
using OrderCraft.Services;

namespace OrderCraft.Controllers;

[ApiController]
[Authorize]
[RequirePage("products")]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;

    public ProductsController(IProductService productService)
    {
        _productService = productService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        return Ok(await _productService.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var product = await _productService.GetByIdAsync(id, cancellationToken);
        return product is null
            ? NotFound(new { message = "Product not found." })
            : Ok(product);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string name,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Query parameter 'name' is required." });

        return Ok(await _productService.SearchByNameAsync(name, cancellationToken));
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateProductRequest request,
        CancellationToken cancellationToken)
    {
        var (product, conflictMessage) = await _productService.CreateAsync(request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return CreatedAtAction(nameof(GetById), new { id = product!.Id }, product);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateProductRequest request,
        CancellationToken cancellationToken)
    {
        var (product, conflictMessage) = await _productService.UpdateAsync(id, request, cancellationToken);

        if (conflictMessage is not null)
            return Conflict(new { message = conflictMessage });

        return product is null
            ? NotFound(new { message = "Product not found." })
            : Ok(product);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id, CancellationToken cancellationToken)
    {
        var (deleted, error) = await _productService.SoftDeleteAsync(id, cancellationToken);
        if (error is not null)
            return Conflict(new { message = error });

        return deleted
            ? NoContent()
            : NotFound(new { message = "Product not found." });
    }
}
