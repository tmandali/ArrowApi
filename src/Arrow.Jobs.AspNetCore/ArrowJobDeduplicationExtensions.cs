namespace Arrow.Jobs.AspNetCore;

/// <summary>Job tekilleştirme (deduplication) politikası.</summary>
/// <param name="Enabled">Tekilleştirmenin aktif olup olmadığı.</param>
/// <param name="Window">Tekilleştirme zaman penceresi (TTL).</param>
public sealed record ArrowJobDeduplicationPolicy(bool Enabled, TimeSpan? Window = null);

public static class ArrowJobDeduplicationExtensions
{
    /// <summary>
    /// Aynı parametrelerle mükerrer (duplicate) Job oluşturulmasını engeller.
    /// Çakışan isteklerde HTTP 409 Conflict döner.
    /// </summary>
    /// <param name="builder">Endpoint grubu builder'ı.</param>
    /// <param name="window">Opsiyonel TTL süresi (ör. <c>TimeSpan.FromMinutes(10)</c>). Bu süre içinde aynı parametrelerle yapılan istekler 409 alır.</param>
    public static RouteGroupBuilder PreventDuplicates(
        this RouteGroupBuilder builder,
        TimeSpan? window = null)
    {
        ArgumentNullException.ThrowIfNull(builder);
        return builder.WithMetadata(new ArrowJobDeduplicationPolicy(true, window));
    }
}
