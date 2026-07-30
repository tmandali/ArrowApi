# ArrowApi

A set of .NET libraries for Apache Arrow data interchange over HTTP and background job processing.

## Overview

ArrowApi provides a collection of .NET libraries that enable efficient transfer of Apache Arrow data via HTTP (similar to Arrow Flight) and infrastructure for background job processing of Arrow workloads. The libraries are designed to work together but can be used independently.

## Libraries

| Library | Description |
|---------|-------------|
| **Arrow.Data** | Core Apache Arrow utilities, ADO.NET extensions, batch readers/writers, and data type helpers. |
| **Arrow.Http.Client** | `HttpClient` extension methods for sending and receiving Arrow data over HTTP (e.g., `GetArrowReaderAsync`, `PostArrowWriterAsync`). |
| **Arrow.Http.AspNetCore** | ASP.NET Core (`AddArrowApi`, `UseArrowApi`) — Arrow endpoints, CQRS Dispatcher, response filters. |
| **Arrow.Http.SampleHost** | A sample ASP.NET Core host demonstrating how to serve Arrow data and integrate with job processing. |
| **Arrow.Jobs.Abstractions** | Abstractions for defining and managing background jobs that process Arrow data (`IArrowJobWorker`, `IArrowJobExecutionContext`, `IArrowJobResultStorage`). |
| **Arrow.Jobs.InMemory** | In‑memory job store for development and testing. |
| **Arrow.Jobs.Redis** | Redis‑backed job store for production‑grade durability and scaling. |
| **Arrow.Jobs.AspNetCore** | ASP.NET Core integration for job processing (queuing, status reporting, Server‑Sent Events, static API key auth). |

## Getting Started

### Prerequisites

- Server / host projects: [.NET SDK](https://dotnet.microsoft.com/download) **10.0** (`net10.0`).
- Client libraries (`Arrow.Data`, `Arrow.Jobs.Abstractions`, `Arrow.Http.Client`) also target **`netstandard2.0`** so **.NET Framework 4.8** apps can consume them.

### Client package boundary

Client apps (net48 **or** net10) should reference **only** `Arrow.Http.Client` (plus its transitive `Arrow.Data` / job DTO types).

Do **not** reference from client apps:

- `Arrow.Jobs.InMemory`
- `Arrow.Jobs.Redis`
- `Arrow.Jobs.AspNetCore`
- `Arrow.Http.AspNetCore`

Those packages belong on the server / worker host only. Clients talk to jobs over HTTP.

`tests/Arrow.Http.Client.Net48.Tests` runs on **net48** and covers job create → SSE wait → Arrow read (mock HTTP), plus SSE parsing.

### Build

```bash
dotnet build
```

### Run the Sample Host

The sample host demonstrates a server that serves Arrow data and processes background jobs.

```bash
dotnet run --project src/Arrow.Http.SampleHost/Arrow.Http.SampleHost.csproj
```

The host will listen on `http://localhost:5236` (or as configured in `launchSettings.json`).

## Usage Examples

### Server (ASP.NET Core)

```csharp
var builder = WebApplication.CreateBuilder(args);

// Register Arrow services & job workers
builder.Services.AddArrowApi(arrow =>
{
    arrow.AddJob<DemoArrowJobWorker>("demo");
    arrow.AddJob<ExportReportArrowJobWorker>("export-report");
});

builder.Services.AddStaticApiKeyAuthentication(o =>
{
    o.ApiKey = "dev-secret";
});

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

// Route job endpoints with policies
app.UseArrowApi("/api/arrow/jobs", jobs =>
{
    jobs.MapJob("demo").RequireAuthorization("DemoJobPolicy").PreventDuplicates(TimeSpan.FromMinutes(10));
    jobs.MapJob("export-report").RequireAuthorization("DemoJobPolicy");
});

app.MapArrowDemoEndpoints();

app.Run();
```

### Job Worker & Chaining (Lazy Result Streaming)

```csharp
public sealed class DemoArrowJobWorker : IArrowJobWorker<ArrowQueryRequest>
{
    private readonly IArrowJobExecutionContext _context;

    public DemoArrowJobWorker(IArrowJobExecutionContext context)
    {
        _context = context;
    }

    public async IAsyncEnumerable<RecordBatch> Handle(
        ArrowQueryRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await _context.PublishInfoAsync($"Executing query: {request.Query}", cancellationToken);

        // 1. Process primary database query to Arrow RecordBatches
        await using DbDataReader reader = ArrowSamples.OpenDemoQueryReader(request.Query, request.Parameters);
        await using ArrowBatchReader arrowReader = ArrowData.OpenArrowReader(reader);

        await foreach (RecordBatch batch in arrowReader.ReadBatchesAsync(cancellationToken))
            yield return batch;

        // 2. Chain next job immediately in background (non-blocking enqueue)
        var reportJob = await _context.EnqueueNextJobAsync(
            "export-report",
            new ExportReportRequest("DemoReport", _context.JobId),
            cancellationToken);

        // 3. Lazily wait and read chained job result batches when iterated
        await foreach (RecordBatch reportBatch in _context.ReadBatchesAsync(reportJob, cancellationToken))
        {
            // Process chained report RecordBatches
        }
    }
}
```

### Client

```csharp
using var http = new HttpClient();

// Read Arrow data from an endpoint
await using var reader = await http.GetArrowReaderAsync("http://localhost:5236/arrow");
await foreach (var batch in reader.ReadBatchesAsync())
{
    // Process each RecordBatch
}

// Send Arrow data to an endpoint
await using var writer = http.PostArrowWriterAsync("http://localhost:5236/arrow");
await writer.WriteBatchAsync(myBatch);
```

### Background Jobs (Client API)

```csharp
// Submit a job with API key
using var http = new HttpClient();
http.DefaultRequestHeaders.Add("X-API-Key", "dev-secret");

var job = await http.PostArrowJobAsync("http://localhost:5236/api/arrow/jobs/demo", new ArrowQueryRequest(
    "inmemory",
    "SELECT * FROM People WHERE Id <= @limit",
    new Dictionary<string, object?> { ["limit"] = 3 }));

// Wait via SSE (blocks until completed/failed; works on net48 too)
await foreach (var evt in job.ReadEventsAsync())
{
    if (evt.EventType is ArrowJobEventNames.Completed or ArrowJobEventNames.Failed)
        break;
}

await using var reader = await job.GetArrowReaderAsync();
await foreach (var batch in reader.ReadBatchesAsync())
{
    // Process result batches
}
```

On older .NET Framework projects you may need binding redirects for `System.Text.Json` and related assemblies.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## Acknowledgments

- [Apache Arrow](https://arrow.apache.org/)
- [.NET](https://dotnet.microsoft.com/)
