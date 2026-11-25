using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using OrderCraft.Models;
using OrderCraft.Services;

namespace OrderCraft.Tenancy;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequirePageAttribute : Attribute, IAsyncActionFilter
{
    public RequirePageAttribute(string pageKey)
    {
        PageKey = pageKey;
    }

    public string PageKey { get; }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var tenant = context.HttpContext.RequestServices.GetRequiredService<ITenantContext>();
        var permissions = context.HttpContext.RequestServices.GetRequiredService<IPermissionService>();

        if (tenant.UserId is null)
        {
            context.Result = new UnauthorizedObjectResult(new { message = "Invalid token." });
            return;
        }

        if (tenant.IsPlatformAdmin)
        {
            context.Result = new ObjectResult(new { message = "Platform administrators cannot access tenant data." })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        if (!tenant.HasOrganization)
        {
            context.Result = new ObjectResult(new { message = "Select an organization first." })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        var method = context.HttpContext.Request.Method;
        var required = HttpMethods.IsGet(method) || HttpMethods.IsHead(method)
            ? PageAccessLevel.View
            : PageAccessLevel.Edit;

        var allowed = await permissions.HasAccessAsync(
            tenant.UserId.Value,
            tenant.OrganizationId!.Value,
            PageKey,
            required,
            context.HttpContext.RequestAborted);

        if (!allowed)
        {
            context.Result = new ObjectResult(new { message = "You do not have access to this page." })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        await next();
    }
}
