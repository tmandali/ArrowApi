namespace Arrow.Http.AspNetCore;

/// <summary>Arrow ASP.NET Core uygulama extension'ları.</summary>
public static class ArrowAspNetCoreApplicationExtensions
{
    /// <summary>
    /// Kayıtlı <see cref="IArrowApiFeature"/>'ları uygular (ör. job endpoint map).
    /// Feature yoksa no-op. <see cref="ArrowAspNetCoreServiceExtensions.AddArrowResponse"/> ile birlikte kullanın.
    /// </summary>
    public static WebApplication UseArrowApi(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        foreach (IArrowApiFeature feature in app.Services.GetServices<IArrowApiFeature>())
            feature.Use(app);

        return app;
    }
}
