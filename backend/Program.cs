using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using OrderCraft.Auth;
using OrderCraft.Routes;
using OrderCraft.Services;
using Swashbuckle.AspNetCore.SwaggerGen;
using Swashbuckle.AspNetCore.SwaggerUI;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpContextAccessor();

builder.Configuration.AddJsonFile(
    "appsettings.Local.json",
    optional: true,
    reloadOnChange: true);

// Controllers — enums as string names in JSON + Swagger (not numbers)
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

// Swagger / OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "OrderCraft API",
        Version = "v1",
        Description = "B2B Procurement and Financial Operations API"
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter JWT token as: Bearer {token}"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });

    options.TagActionsBy(api =>
    {
        if (!string.IsNullOrWhiteSpace(api.GroupName))
            return new[] { api.GroupName };

        return api.ActionDescriptor.RouteValues.TryGetValue("controller", out var controller)
               && !string.IsNullOrWhiteSpace(controller)
            ? new[] { controller }
            : new[] { "API" };
    });
    options.DocInclusionPredicate((_, _) => true);
    options.CustomSchemaIds(type => type.Name);
    options.DescribeAllParametersInCamelCase();
    options.OrderActionsBy(api =>
        $"{api.ActionDescriptor.RouteValues["controller"]}_{api.HttpMethod}_{api.RelativePath}");
    options.DocumentFilter<SwaggerTagsDocumentFilter>();
});

// Entity Framework Core + PostgreSQL (tenant GUC via TenantConnectionInterceptor)
builder.Services.AddScoped<TenantConnectionInterceptor>(sp =>
{
    var tenant = sp.GetService<ITenantContext>();
    if (tenant?.OrganizationId is Guid orgId && orgId != Guid.Empty)
        return new TenantConnectionInterceptor(orgId.ToString());

    var httpUser = sp.GetRequiredService<IHttpContextAccessor>().HttpContext?.User;
    var claim =
        httpUser?.FindFirst(TenantMiddleware.OrgIdClaim)?.Value
        ?? httpUser?.FindFirst("organizationId")?.Value
        ?? string.Empty;

    return new TenantConnectionInterceptor(claim);
});

builder.Services.AddDbContext<ApplicationDbContext>((sp, options) =>
{
    var interceptor = sp.GetRequiredService<TenantConnectionInterceptor>();
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
        .AddInterceptors(interceptor);
});

// JWT Authentication
builder.Services.AddOrderCraftJwtAuthentication(builder.Configuration);

// AutoMapper
builder.Services.AddAutoMapper(typeof(Program));

// Application services (FluentValidation + business services)
builder.Services.AddOrderCraftServices();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy.WithOrigins("http://localhost:3000", "http://localhost:3001")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    await SampleDataSeeder.SeedAsync(app.Services);

    // Swagger Root Endpoint Pattern: UI at "/", spec at "/swagger/v1/swagger.json".
    // Absolute spec URL is required — a relative "v1/swagger.json" 404s from /index.html.
    app.UseSwagger(options =>
    {
        options.RouteTemplate = "swagger/{documentName}/swagger.json";
    });
    app.UseSwaggerUI(options =>
    {
        options.RoutePrefix = string.Empty;
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "OrderCraft API v1");
        options.DocumentTitle = "OrderCraft API";
        options.DocExpansion(DocExpansion.List);
        options.DefaultModelsExpandDepth(-1);
        options.DefaultModelExpandDepth(0);
        options.DisplayRequestDuration();
        options.EnableFilter();
        options.EnableDeepLinking();
        options.EnablePersistAuthorization();
        options.HeadContent = """
            <style>
              .swagger-ui .topbar { display: none; }
              .swagger-ui .info { margin: 24px 0 8px; }
              .swagger-ui .scheme-container { box-shadow: none; background: transparent; padding: 12px 0; }
            </style>
            """;
    });
}

app.UseCors("Frontend");

if (!app.Environment.IsDevelopment())
    app.UseHttpsRedirection();

app.UseRouting();
app.UseMiddleware<RequestIdMiddleware>();
app.UseMiddleware<CancellationExceptionMiddleware>();
app.UseAuthentication();
app.UseMiddleware<TenantMiddleware>();
app.UseAuthorization();
app.UseMiddleware<IdempotencyMiddleware>();

app.MapOrderCraftRoutes();

if (app.Environment.IsDevelopment())
{
    app.MapGet("/swagger", () => Results.Redirect("/"))
        .ExcludeFromDescription();
    app.MapGet("/swagger/index.html", () => Results.Redirect("/"))
        .ExcludeFromDescription();

    // Manual cancel probe: call then abort the client — server returns 499, not 500.
    app.MapGet("/api/dev/hang", async (HttpContext context) =>
    {
        await Task.Delay(Timeout.Infinite, context.RequestAborted);
        return Results.Ok(new { message = "unreachable" });
    }).ExcludeFromDescription();
}

app.Run();

file sealed class SwaggerTagsDocumentFilter : IDocumentFilter
{
    public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
    {
        swaggerDoc.Tags =
        [
            new OpenApiTag { Name = "Auth", Description = "Login and JWT session" },
            new OpenApiTag { Name = "Organizations", Description = "Tenants and memberships" },
            new OpenApiTag { Name = "Permissions", Description = "Page access for organization members" },
            new OpenApiTag { Name = "Users", Description = "Employees in the current organization" },
            new OpenApiTag { Name = "Companies", Description = "Clients and vendors" },
            new OpenApiTag { Name = "Categories", Description = "Product categories" },
            new OpenApiTag { Name = "Products", Description = "Catalog" },
            new OpenApiTag { Name = "Orders", Description = "Purchase orders and status transitions" },
            new OpenApiTag { Name = "Invoices", Description = "Invoices generated from purchase orders" },
            new OpenApiTag { Name = "Dashboard", Description = "High-level organization metrics" },
            new OpenApiTag { Name = "AuditLogs", Description = "Activity history" }
        ];
    }
}
