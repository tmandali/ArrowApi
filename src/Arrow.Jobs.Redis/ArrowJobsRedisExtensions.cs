using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;
using System.Reflection;

namespace Arrow.Jobs.Redis;

/// <summary>Redis tabanlı job store/queue/hub kayıt extension'ları.</summary>
public static class ArrowJobsRedisExtensions
{
    /// <summary>Belirtilen istek türü için Redis tabanlı job altyapısını kaydeder.</summary>
    public static ArrowJobsBuilder<TRequest> UseRedis<TRequest>(
        this ArrowJobsBuilder<TRequest> builder,
        string connectionString)
        where TRequest : notnull
    {
        ConfigureRedis<TRequest>(builder.Services, connectionString);
        return builder;
    }

    /// <summary>
    /// IConfiguration üzerinden bağlantı dizesi okuyarak Redis tabanlı job altyapısını kaydeder.
    /// Ör. <c>builder.Configuration</c> (root) veya <c>builder.Configuration.GetSection("Redis")</c>.
    /// </summary>
    public static ArrowJobsBuilder<TRequest> UseRedis<TRequest>(
        this ArrowJobsBuilder<TRequest> builder,
        IConfiguration configuration)
        where TRequest : notnull
    {
        string? conn = configuration.GetConnectionString("Redis") ?? configuration["ConnectionStrings:Redis"];
        if (string.IsNullOrWhiteSpace(conn))
            throw new InvalidOperationException(
                $"'ConnectionStrings:Redis' (ya da 'Redis:ConnectionString') bulunamadı. Configuration: {configuration}");
        ConfigureRedis<TRequest>(builder.Services, conn);
        return builder;
    }

    /// <summary>Belirtilen yapılandırıcı için Redis tabanlı job altyapısını kaydeder.</summary>
    public static IArrowJobsConfigurer UseRedis(this IArrowJobsConfigurer configurer, string connectionString)
    {
        ArgumentNullException.ThrowIfNull(configurer);
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        ConfigureRedis(configurer.RequestType, configurer.Services, connectionString);
        return configurer;
    }

    /// <summary>
    /// IConfiguration üzerinden bağlantı dizesi okuyarak Redis tabanlı job altyapısını kaydeder.
    /// </summary>
    public static IArrowJobsConfigurer UseRedis(this IArrowJobsConfigurer configurer, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configurer);
        string? conn = configuration.GetConnectionString("Redis") ?? configuration["ConnectionStrings:Redis"];
        if (string.IsNullOrWhiteSpace(conn))
            throw new InvalidOperationException("'ConnectionStrings:Redis' configuration'da bulunamadı.");
        ConfigureRedis(configurer.RequestType, configurer.Services, conn);
        return configurer;
    }

    private static void ConfigureRedis<TRequest>(IServiceCollection services, string connectionString)
        where TRequest : notnull
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        services.RemoveAll<IArrowJobStore<TRequest>>();
        services.RemoveAll<IArrowJobQueue<TRequest>>();
        services.TryAddSingleton<IConnectionMultiplexer>(_ =>
        {
            var options = ConfigurationOptions.Parse(connectionString);
            // Redis ilk bağlantıda erişilemezse host başlangıcı kırılmasın;
            // multiplexer arka planda reconnect retry etmeye devam eder.
            options.AbortOnConnectFail = false;
            return ConnectionMultiplexer.Connect(options);
        });
        services.TryAddSingleton<IArrowJobStore<TRequest>, RedisArrowJobStore<TRequest>>();
        // Generic'siz kayıt: AspNetCore endpoint'leri (FindJobStoreAsync) IArrowJobStore üzerinden dolaşır.
        services.AddSingleton<IArrowJobStore>(sp => (IArrowJobStore)sp.GetRequiredService<IArrowJobStore<TRequest>>());
        services.TryAddSingleton(typeof(IArrowJobQueue<TRequest>), sp =>
        {
            var loggerFactory = sp.GetRequiredService<ILoggerFactory>();
            ILogger<RedisArrowJobQueue<TRequest>> logger =
                loggerFactory.CreateLogger<RedisArrowJobQueue<TRequest>>();
            return new RedisArrowJobQueue<TRequest>(
                sp.GetRequiredService<IConnectionMultiplexer>(), logger);
        });
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
