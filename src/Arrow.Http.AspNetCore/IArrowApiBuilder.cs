using Microsoft.Extensions.DependencyInjection;

namespace Arrow.Http.AspNetCore;

/// <summary>
/// Arrow API servislerinin fluent (akıcı) yapılandırılması için builder arayüzü.
/// </summary>
public interface IArrowApiBuilder
{
    IServiceCollection Services { get; }
}

internal sealed class ArrowApiBuilder(IServiceCollection services) : IArrowApiBuilder
{
    public IServiceCollection Services { get; } = services;
}
