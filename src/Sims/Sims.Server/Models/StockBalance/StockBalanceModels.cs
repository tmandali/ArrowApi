using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using Apache.Arrow;
using Arrow.Http.AspNetCore.Dispatcher;

namespace Sims.Server.Models.StockBalance;

/// <summary>
/// Schema-driven Stock Balance criteria payload (JSON Schema → submit instance).
/// All criteria fields are captured via <see cref="Criteria"/>.
/// </summary>
public sealed class StockBalanceRequest : IRequest<IAsyncEnumerable<RecordBatch>>
{
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Criteria { get; set; }

    public int? BatchSize { get; init; }

    /// <summary>Mock satır sayısı (demo/test). Varsayılan 2.</summary>
    public int? SampleRows { get; init; }
}
