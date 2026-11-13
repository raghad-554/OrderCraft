namespace OrderCraft;

public static class RequestCorrelation
{
    public const string HeaderName = "X-Request-Id";
    public const string ItemKey = "OrderCraft.RequestId";
    public const int MaxLength = 64;

    public static string? Get(HttpContext context) =>
        context.Items.TryGetValue(ItemKey, out var value) ? value as string : null;

    public static void Set(HttpContext context, string requestId) =>
        context.Items[ItemKey] = requestId;
}
