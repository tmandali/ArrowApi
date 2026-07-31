using System.Data;
using System.Data.Common;
using Arrow.Data;
using Arrow.Http.AspNetCore;
using Arrow.Jobs;

namespace Arrow.Http.SampleHost.Endpoints;

public static class DbQueryEndpoints
{
    public static IEndpointRouteBuilder MapDbQueryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        endpoints.MapGet("/arrow/from-db", GetPeopleFromDbClose).ProducesArrow();
        endpoints.MapGet("/arrow/from-db-await", GetPeopleFromDbAwait).ProducesArrow();
        endpoints.MapPost("/arrow/query", PostQueryAsync)
            .Accepts<ArrowQueryRequest>("application/json")
            .ProducesArrow();

        return endpoints;
    }

    /// <summary>
    /// <see cref="ArrowResults.FromDb"/> — <c>close: true</c> (varsayılan); reader üzerinde <c>using</c> kullanmayın.
    /// Gerçek kodda: <c>DbDataReader reader = await cmd.ExecuteReaderAsync(ct); return ArrowResults.FromDb(reader);</c>
    /// </summary>
    private static IResult GetPeopleFromDbClose()
    {
        DataTable table = ArrowSamples.CreatePeopleTable();
        return ArrowResults.FromDb(table.CreateDataReader(), close: true);
    }

    /// <summary>
    /// <see cref="ArrowHttpExtensions.WriteArrowFromDbAsync"/> — <c>await using</c> + <c>close: false</c>.
    /// Gerçek kodda: <c>await using var reader = await cmd.ExecuteReaderAsync(ct);</c>
    /// </summary>
    private static async Task GetPeopleFromDbAwait(HttpResponse response, CancellationToken cancellationToken)
    {
        using DataTable table = ArrowSamples.CreatePeopleTable();
        await using DbDataReader reader = table.CreateDataReader();
        await response.WriteArrowFromDbAsync(reader, close: false);
    }

    /// <summary>
    /// Parametreli sorgu → Arrow IPC (<see cref="ArrowResults.FromDb"/> + <see cref="ArrowConversionOptions.BatchSize"/>).
    /// </summary>
    private static IResult PostQueryAsync(ArrowQueryRequest request)
    {
        DbDataReader reader = ArrowSamples.OpenDemoQueryReader(request.Query, request.Parameters);
        ArrowConversionOptions? options = ArrowSamples.CreateConversionOptions(request.BatchSize);
        return ArrowResults.FromDb(reader, options, close: true);
    }
}
