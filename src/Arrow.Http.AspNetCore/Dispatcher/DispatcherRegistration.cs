using System.Collections.Frozen;
using System.Reflection;

namespace Arrow.Http.AspNetCore.Dispatcher;

public static class DispatcherRegistration
{
    /// <summary>
    /// Registers the dispatcher and scans the given assembly for IRequestHandler and
    /// INotificationHandler implementations. Wrappers are built once and frozen.
    /// </summary>
    public static IServiceCollection AddDispatcher(this IServiceCollection services, Assembly assembly)
    {
        var requestWrappers = new Dictionary<Type, RequestHandlerBase>();
        var notificationWrappers = new Dictionary<Type, NotificationHandlerBase>();

        foreach (var type in assembly.GetTypes())
        {
            if (type.IsAbstract || type.IsInterface) continue;

            foreach (var iface in type.GetInterfaces())
            {
                if (!iface.IsGenericType) continue;
                var def = iface.GetGenericTypeDefinition();

                if (def == typeof(IRequestHandler<,>))
                {
                    services.AddScoped(iface, type);

                    var args = iface.GetGenericArguments();
                    var requestType = args[0];
                    var responseType = args[1];

                    if (!requestWrappers.ContainsKey(requestType))
                    {
                        var wrapperType = typeof(RequestHandlerWrapper<,>)
                            .MakeGenericType(requestType, responseType);
                        requestWrappers[requestType] =
                            (RequestHandlerBase)Activator.CreateInstance(wrapperType)!;
                    }
                }
                else if (def == typeof(INotificationHandler<>))
                {
                    services.AddScoped(iface, type);

                    var notificationType = iface.GetGenericArguments()[0];
                    if (!notificationWrappers.ContainsKey(notificationType))
                    {
                        var wrapperType = typeof(NotificationHandlerWrapper<>)
                            .MakeGenericType(notificationType);
                        notificationWrappers[notificationType] =
                            (NotificationHandlerBase)Activator.CreateInstance(wrapperType)!;
                    }
                }
            }
        }

        var registry = new DispatcherRegistry(
            requestWrappers.ToFrozenDictionary(),
            notificationWrappers.ToFrozenDictionary());

        services.AddSingleton(registry);
        services.AddScoped<Dispatcher>();
        services.AddScoped<ISender>(sp => sp.GetRequiredService<Dispatcher>());
        services.AddScoped<IPublisher>(sp => sp.GetRequiredService<Dispatcher>());

        // Varsayılan Pipeline Behavior'lar: Tracing ve Exception Handling
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(Arrow.Http.AspNetCore.Behaviors.TracingBehavior<,>));
        services.AddScoped(typeof(IPipelineBehavior<,>), typeof(Arrow.Http.AspNetCore.Behaviors.JobExceptionHandlingBehavior<,>));

        return services;
    }

    /// <summary>
    /// Registers an open-generic pipeline behavior. Order of registration is order of execution.
    /// </summary>
    public static IServiceCollection AddPipelineBehavior(
        this IServiceCollection services,
        Type openGenericBehaviorType)
    {
        services.AddScoped(typeof(IPipelineBehavior<,>), openGenericBehaviorType);
        return services;
    }
}