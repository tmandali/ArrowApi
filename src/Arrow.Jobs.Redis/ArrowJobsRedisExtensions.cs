using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Arrow.Jobs.InMemory;
using StackExchange.Redis;

namespace Arrow.Jobs.Redis;

public static class ArrowJobsRedisExtensions
{
    public static ArrowJobsBuilder<TRequest> UseRedis<TRequest>(
        this ArrowJobsBuilder<TRequest> builder,
        string connectionString)
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
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        services.RemoveAll<IArrowJobStore<TRequest>>();
        services.RemoveAll<IArrowJobQueue>();
        services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(connectionString));
        services.TryAddSingleton<IArrowJobStore<TRequest>, RedisArrowJobStore<TRequest>>();
        services.TryAddSingleton<IArrowJobQueue, RedisArrowJobQueue>();
    }

    private static void ConfigureRedis(Type requestType, IServiceCollection services, string connectionString)
    {
        MethodInfo method = typeof(ArrowJobsRedisExtensions)
            .GetMethod(nameof(ConfigureRedis), BindingFlags.NonPublic | BindingFlags.Static, [typeof(IServiceCollection), typeof(string)])!
            .MakeGenericMethod(requestType);

        method.Invoke(null, [services, connectionString]);
    }
}
