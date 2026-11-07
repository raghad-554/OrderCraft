using Microsoft.EntityFrameworkCore;
using OrderCraft.Models;
using OrderCraft.Schemas;

namespace OrderCraft.Services;

public class CategoryService : ICategoryService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ITenantContext _tenant;

    public CategoryService(ApplicationDbContext dbContext, ITenantContext tenant)
    {
        _dbContext = dbContext;
        _tenant = tenant;
    }

    public async Task<IReadOnlyList<CategoryResponse>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var categories = await _dbContext.Categories
            .AsNoTracking()
            .OrderBy(c => c.Name)
            .ToListAsync(cancellationToken);

        return categories.Select(ProcurementMappings.ToResponse).ToList();
    }

    public async Task<CategoryResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var category = await _dbContext.Categories
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        return category is null ? null : ProcurementMappings.ToResponse(category);
    }

    public async Task<(CategoryResponse? Category, string? ConflictMessage)> CreateAsync(
        CreateCategoryRequest request,
        CancellationToken cancellationToken = default)
    {
        var name = request.Name.Trim();
        var orgId = _tenant.RequireOrganizationId();
        var exists = await _dbContext.Categories
            .IgnoreQueryFilters()
            .AnyAsync(c => !c.IsDeleted && c.OrganizationId == orgId && c.Name.ToLower() == name.ToLower(), cancellationToken);

        if (exists)
            return (null, "Category name is already taken.");

        var category = new Category
        {
            OrganizationId = orgId,
            Name = name,
            Description = string.IsNullOrWhiteSpace(request.Description)
                ? null
                : request.Description.Trim(),
            IsDeleted = false
        };

        _dbContext.Categories.Add(category);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return (ProcurementMappings.ToResponse(category), null);
    }
}
