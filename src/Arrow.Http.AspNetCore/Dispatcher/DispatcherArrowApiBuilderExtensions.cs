using System.Reflection;

namespace Arrow.Http.AspNetCore.Dispatcher;

public static class DispatcherArrowApiBuilderExtensions
{
    /// <summary>
    /// CQRS Dispatcher motorunu ve belirtilen assembly'deki handler'ları kaydeder.
    /// </summary>
    public static IArrowApiBuilder AddDispatcher(this IArrowApiBuilder builder, Assembly assembly)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentNullException.ThrowIfNull(assembly);

        builder.Services.AddDispatcher(assembly);
        return builder;
    }
}
