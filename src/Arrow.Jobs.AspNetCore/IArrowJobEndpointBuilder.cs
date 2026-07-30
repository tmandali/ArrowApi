using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

namespace Arrow.Jobs.AspNetCore;

/// <summary>
/// Arrow Job endpoint haritalaması için akıcı (fluent) builder arayüzü.
/// </summary>
public interface IArrowJobEndpointBuilder
{
    /// <summary>
    /// İsmi <paramref name="name"/> olan job'ı <paramref name="path"/> altında haritalar.
    /// <paramref name="path"/> verilmezse ve tek job varsa ana prefix seviyesinde haritalanır.
    /// </summary>
    /// <param name="name">DI tarafında kaydolurken verilen job ismi (ör. <c>"export"</c>).</param>
    /// <param name="path">HTTP endpoint alt yolu (ör. <c>"exports"</c> veya <c>"/exports"</c>). Eğik çizgi zorunlu değildir.</param>
    RouteGroupBuilder MapJob(string name = "default", string? path = null);
}

internal sealed class ArrowJobEndpointBuilder(
    IEndpointRouteBuilder endpoints,
    IReadOnlyCollection<ArrowJobEndpointRegistration> registrations) : IArrowJobEndpointBuilder
{
    public RouteGroupBuilder MapJob(string name = "default", string? path = null)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        ArrowJobEndpointRegistration? registration = registrations.FirstOrDefault(r =>
            string.Equals(r.NameOrPath, name, StringComparison.OrdinalIgnoreCase));

        if (registration is null && registrations.Count == 1)
        {
            registration = registrations.First();
        }

        if (registration is null)
        {
            throw new InvalidOperationException(
                $"'{name}' adında bir Arrow job kaydı bulunamadı. Lütfen builder.Services.AddArrowApi(a => a.AddJob<T>(\"{name}\")) ile kaydettiğinizden emin olun.");
        }

        string rawPath = string.IsNullOrWhiteSpace(path) ? name : path;
        string normalizedPath = NormalizeRelativePath(rawPath);

        return ArrowJobEndpoints.MapRegisteredType(endpoints, registration.ServiceType, normalizedPath);
    }

    private static string NormalizeRelativePath(string path)
    {
        path = path.Trim();
        if (string.IsNullOrEmpty(path))
            return string.Empty;

        if (!path.StartsWith('/'))
            path = "/" + path;

        return path.TrimEnd('/');
    }
}
