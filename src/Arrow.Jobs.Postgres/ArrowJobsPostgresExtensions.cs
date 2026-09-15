using Arrow.Jobs.InMemory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using System.Reflection;

namespace Arrow.Jobs.Postgres;

/// <summary>
/// Postgres (Npgsql) tabanlı job store kayıt extension'ları.
/// Dev senaryosunda sunucu, <c>pglite-socket</c> ile açılmış yerel PGlite'a
/// standart Npgsql bağlantı dizesi üzerinden bağlanır.
/// </summary>
public static class ArrowJobsPostgresExtensions
{
    /// <summary>
    /// Belirtilen istek türü için Postgres tabanlı store kaydeder.
    /// Queue/event hub tek-host dev senaryosu için InMemory olarak kalır.
    /// </summary>
    public static ArrowJobsBuilder<TRequest> UsePostgres<TRequest>(
        this ArrowJobsBuilder<TRequest> builder,
        string connectionString)
        where TRequest : notnull
    {
        ConfigurePostgres<TRequest>(builder.Services, connectionString);
        return builder;
    }

    /// <summary>Belirtilen yapılandırıcı için Postgres tabanlı store kaydeder.</summary>
    public static void UsePostgres(this IArrowJobsConfigurer configurer, string connectionString)
    {
        ArgumentNullException.ThrowIfNull(configurer);
        ConfigurePostgres(configurer.RequestType, configurer.Services, connectionString);
    }

    private static void ConfigurePostgres<TRequest>(IServiceCollection services, string connectionString)
        where TRequest : notnull
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        new ArrowJobsBuilder<TRequest>(services).RemoveBackend();

        services.TryAddSingleton(_ => new NpgsqlDataSourceBuilder(connectionString).Build());
        services.TryAddSingleton<IArrowJobStore<TRequest>>(
            sp => new PostgresArrowJobStore<TRequest>(sp.GetRequiredService<NpgsqlDataSource>()));
        services.TryAddSingleton<IArrowJobStore>(
            sp => (IArrowJobStore)sp.GetRequiredService<IArrowJobStore<TRequest>>());

        // Tek-host dev senaryosu: queue/event hub bellek içi (process restart'ta
        // queue sıfırlanır; kalıcılık katmanı Postgres store'dur).
        services.TryAddSingleton<IArrowJobQueue<TRequest>, InMemoryArrowJobQueue<TRequest>>();
        services.TryAddSingleton<IArrowJobEventHub, InMemoryArrowJobEventHub>();
    }

    private static void ConfigurePostgres(Type requestType, IServiceCollection services, string connectionString)
    {
        MethodInfo method = typeof(ArrowJobsPostgresExtensions)
            .GetMethod(nameof(ConfigurePostgres), BindingFlags.NonPublic | BindingFlags.Static,
                [typeof(IServiceCollection), typeof(string)])!
            .MakeGenericMethod(requestType);

        method.Invoke(null, [services, connectionString]);
    }
}
