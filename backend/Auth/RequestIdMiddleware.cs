namespace OrderCraft.Auth;

public sealed class RequestIdMiddleware
{
    private readonly RequestDelegate _next;

    public RequestIdMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var incoming = context.Request.Headers[RequestCorrelation.HeaderName].FirstOrDefault();
        var requestId = Normalize(incoming) ?? Guid.NewGuid().ToString("N");

        RequestCorrelation.Set(context, requestId);
        context.Response.OnStarting(() =>
        {
            if (!context.Response.Headers.ContainsKey(RequestCorrelation.HeaderName))
                context.Response.Headers[RequestCorrelation.HeaderName] = requestId;
            return Task.CompletedTask;
        });

        await _next(context);
    }

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var trimmed = value.Trim();
        if (trimmed.Length > RequestCorrelation.MaxLength)
            trimmed = trimmed[..RequestCorrelation.MaxLength];

        return trimmed.All(c => char.IsLetterOrDigit(c) || c is '-' or '_')
            ? trimmed
            : null;
    }
}
