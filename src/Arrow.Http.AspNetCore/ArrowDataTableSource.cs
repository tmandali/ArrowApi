using System.Data;

namespace Arrow.Http.AspNetCore;

/// <summary>
/// Endpoint'in <see cref="DataTable"/> döndürmesi için işaret tipi.
/// <see cref="ArrowAspNetCoreServiceExtensions.AddArrowResponse"/> ile Arrow IPC'ye dönüştürülür.
/// </summary>
public sealed record ArrowDataTableSource(
    DataTable Table,
    ArrowConversionOptions? Options = null);
