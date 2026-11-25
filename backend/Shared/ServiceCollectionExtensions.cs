using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.AspNetCore.Identity;
using OrderCraft.Auth.Cookies;
using OrderCraft.Auth.Jwt;
using OrderCraft.Auth.Revocation;
using OrderCraft.Models;
using OrderCraft.Tenancy;

namespace OrderCraft.Services;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddOrderCraftServices(this IServiceCollection services)
    {
        services.AddFluentValidationAutoValidation();
        services.AddValidatorsFromAssemblyContaining<ApplicationDbContext>();

        services.AddHttpContextAccessor();
        services.AddScoped<ITenantContext, TenantContext>();
        services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddScoped<IPasswordService, PasswordService>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<ITokenRevocationService, TokenRevocationService>();
        services.AddSingleton<IAuthCookieService, AuthCookieService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IPermissionService, PermissionService>();
        services.AddScoped<IOrganizationService, OrganizationService>();
        services.AddScoped<IOrgCatalogService, OrgCatalogService>();
        services.AddScoped<IPlatformOrganizationService, PlatformOrganizationService>();
        services.AddScoped<ICompanyService, CompanyService>();
        services.AddScoped<ICategoryService, CategoryService>();
        services.AddScoped<IProductService, ProductService>();
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<IInvoiceService, InvoiceService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<IDashboardService, DashboardService>();

        return services;
    }
}
