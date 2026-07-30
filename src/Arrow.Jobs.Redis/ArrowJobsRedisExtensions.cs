using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using StackExchange.Redis;
using System.Reflection;

namespace Arrow.Jobs.Redis;

public static class ArrowJobsRedisExtensions
{
    public static ArrowJobsBuilder<TRequest> UseRedis<TRequest>(
        this ArrowJobsBuilder<TRequest> builder,
        string connectionString)
        where TRequest : notnull
    {
        ConfigureRedis<TRequest>(builder.Services, connectionString);
        return builder;
    }

    public static void UseRedis(this IArrowJobsConfigurer configurer, string connectionString)
    {
        ArgumentNullException.ThrowIfNull(configurer);
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        ConfigureRedis(configurer.RequestType, configurer.Services, connectionString);
    }

    private static void ConfigureRedis<TRequest>(IServiceCollection services, string connectionString)
        where TRequest : notnull
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        services.RemoveAll<IArrowJobStore<TRequest>>();
        services.RemoveAll<IArrowJobQueue<TRequest>>();
        services.RemoveAll<IArrowJobEventHub>();
        services.TryAddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(connectionString));
        services.TryAddSingleton<IArrowJobStore<TRequest>, RedisArrowJobStore<TRequest>>();
        services.TryAddSingleton<IArrowJobQueue<TRequest>, RedisArrowJobQueue<TRequest>>();
        services.TryAddSingleton<IArrowJobEventHub, RedisArrowJobEventHub>();
    }

    private static void ConfigureRedis(Type requestType, IServiceCollection services, string connectionString)
    {
        MethodInfo method = typeof(ArrowJobsRedisExtensions)
            .GetMethod(nameof(ConfigureRedis), BindingFlags.NonPublic | BindingFlags.Static, [typeof(IServiceCollection), typeof(string)])!
            .MakeGenericMethod(requestType);

        method.Invoke(null, [services, connectionString]);
    }
}
