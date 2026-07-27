namespace Arrow.Http.AspNetCore;

/// <summary>Arrow ASP.NET Core uygulama extension'ları.</summary>
public static class ArrowAspNetCoreApplicationExtensions
{
    /// <summary>
    /// Arrow yanıt desteğini etkinleştirir. <see cref="ArrowAspNetCoreServiceExtensions.AddArrowResponse"/> ile birlikte kullanın.
    /// </summary>
    public static WebApplication UseArrowResponse(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);
        return app;
    }
}
