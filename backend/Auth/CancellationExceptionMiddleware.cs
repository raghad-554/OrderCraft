using System.Text.Json;

namespace OrderCraft.Auth;

/// <summary>
/// Maps client-aborted requests to a stable non-500 response instead of an unhandled exception.
/// </summary>
public sealed class CancellationExceptionMiddleware
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly RequestDelegate _next;
    private readonly ILogger<CancellationExceptionMiddleware> _logger;

    public CancellationExceptionMiddleware(
        RequestDelegate next,
        ILogger<CancellationExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex) when (IsClientCancellation(ex, context))
        {
            if (context.Response.HasStarted)
                throw;

            _logger.LogInformation(
                "Request cancelled by client: {Method} {Path}",
                context.Request.Method,
                context.Request.Path);

            context.Response.Clear();
            context.Response.StatusCode = 499;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsync(
                JsonSerializer.Serialize(new { message = "Request was cancelled." }, JsonOptions));
        }
    }

    private static bool IsClientCancellation(Exception ex, HttpContext context)
    {
        if (!context.RequestAborted.IsCancellationRequested)
            return false;

        return ex is OperationCanceledException or TaskCanceledException
            || ex.GetBaseException() is OperationCanceledException or TaskCanceledException;
    }
}
