namespace OrderCraft.Auth.Jwt;

public class JwtSettings
{
    public const string SectionName = "Jwt";

    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    /// <summary>JWT lifetime (and Remember me cookie MaxAge). Default 60 minutes.</summary>
    public int ExpireMinutes { get; set; } = 60;
}
