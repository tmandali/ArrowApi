using Arrow.Http.AspNetCore;

namespace Arrow.Jobs.AspNetCore;

/// <summary>
/// <see cref="IArrowApiBuilder"/> için Job extension metotları.
/// </summary>
public static class ArrowJobApiBuilderExtensions
{
    /// <summary>
    /// <see cref="IArrowApiBuilder"/> üzerinden bir job worker/request kaydeder.
    /// <paramref name="name"/> job ismi (ör. <c>"demo"</c>, <c>"export"</c>).
    /// </summary>
    public static IArrowApiBuilder AddJob<T>(
        this IArrowApiBuilder builder,
        string name = "default",
        Action<IArrowJobsConfigurer>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.Services.AddArrowJob<T>(name, configure);
        return builder;
    }
}
