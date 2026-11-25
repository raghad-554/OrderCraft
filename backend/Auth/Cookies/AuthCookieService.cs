using Microsoft.Extensions.Options;
using OrderCraft.Auth.Jwt;

namespace OrderCraft.Auth.Cookies;

public interface IAuthCookieService
{
    void SetAuthCookie(HttpContext http, string token, bool remember);
    void ClearAuthCookie(HttpContext http);
}

public sealed class AuthCookieService : IAuthCookieService
{
    public const string CookieName = "ordercraft_auth";

    private readonly JwtSettings _jwt;

    public AuthCookieService(IOptions<JwtSettings> jwt)
    {
        _jwt = jwt.Value;
    }

    public void SetAuthCookie(HttpContext http, string token, bool remember)
    {
        if (string.IsNullOrWhiteSpace(token))
            return;

        var options = BuildOptions(http, remember);
        http.Response.Cookies.Append(CookieName, token.Trim(), options);
    }

    public void ClearAuthCookie(HttpContext http)
    {
        http.Response.Cookies.Append(
            CookieName,
            string.Empty,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = http.Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                Path = "/",
                Expires = DateTimeOffset.UnixEpoch,
                IsEssential = true
            });
    }

    private CookieOptions BuildOptions(HttpContext http, bool remember)
    {
        var options = new CookieOptions
        {
            HttpOnly = true,
            Secure = http.Request.IsHttps,
            SameSite = SameSiteMode.Lax,
            Path = "/",
            IsEssential = true
        };

        // Remember me: cookie survives browser restart for the same window as the JWT (~ExpireMinutes).
        if (remember)
            options.MaxAge = TimeSpan.FromMinutes(Math.Max(1, _jwt.ExpireMinutes));

        return options;
    }
}
