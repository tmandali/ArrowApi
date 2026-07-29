namespace Arrow.Http.AspNetCore;

/// <summary>
/// <see cref="ArrowAspNetCoreApplicationExtensions.UseArrowApi"/> sırasında çalışan isteğe bağlı kurulum.
/// Jobs paketi endpoint map için kaydeder; yoksa no-op.
/// </summary>
public interface IArrowApiFeature
{
    void Use(WebApplication app);
}
