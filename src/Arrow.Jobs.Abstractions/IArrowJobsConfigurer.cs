using Microsoft.Extensions.DependencyInjection;

namespace Arrow.Jobs;

/// <summary>
/// Job altyapısı yapılandırması — store/kuyruk (backend extension'ları ile).
/// </summary>
public interface IArrowJobsConfigurer
{
    /// <summary>Servis koleksiyonu.</summary>
    IServiceCollection Services { get; }
    /// <summary>Yapılandırılan job istek DTO türü.</summary>
    Type RequestType { get; }
}
