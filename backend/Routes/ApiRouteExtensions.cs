namespace OrderCraft.Routes;

public static class ApiRouteExtensions
{
    /// <summary>
    /// Maps controller endpoints and any additional custom route handlers.
    /// </summary>
    public static WebApplication MapOrderCraftRoutes(this WebApplication app)
    {
        app.MapControllers();
        return app;
    }
}
