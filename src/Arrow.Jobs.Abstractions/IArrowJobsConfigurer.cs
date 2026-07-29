using Microsoft.Extensions.DependencyInjection;

namespace Arrow.Jobs;

/// <summary>
/// Job altyapısı yapılandırması — store/kuyruk (backend extension'ları ile).
/// </summary>
public interface IArrowJobsConfigurer
{
    IServiceCollection Services { get; }
    Type RequestType { get; }
}
