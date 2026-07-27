# ArrowApi

A set of .NET libraries for Apache Arrow data interchange over HTTP and background job processing.

## Overview

ArrowApi provides a collection of .NET libraries that enable efficient transfer of Apache Arrow data via HTTP (similar to Arrow Flight) and infrastructure for background job processing of Arrow workloads. The libraries are designed to work together but can be used independently.

## Libraries

| Library | Description |
|---------|-------------|
| **Arrow.Data** | Core Apache Arrow utilities, ADO.NET extensions, batch readers/writers, and data type helpers. |
| **Arrow.Http.Client** | `HttpClient` extension methods for sending and receiving Arrow data over HTTP (e.g., `GetArrowReaderAsync`, `PostArrowWriterAsync`). |
| **Arrow.Http.AspNetCore** | ASP.NET Core middleware (`AddArrowResponse`, `UseArrowResponse`) to expose Arrow endpoints with minimal setup. |
| **Arrow.Http.SampleHost** | A sample ASP.NET Core host demonstrating how to serve Arrow data and integrate with job processing. |
| **Arrow.Jobs.Abstractions** | Abstractions for defining and managing background jobs that process Arrow data. |
| **Arrow.Jobs.InMemory** | In‑memory job store for development and testing. |
| **Arrow.Jobs.Redis** | Redis‑backed job store for production‑grade durability and scaling. |
| **Arrow.Jobs.AspNetCore** | ASP.NET Core integration for job processing (queuing, status reporting, Server‑Sent Events). |

## Getting Started

### Prerequisites

- [.NET SDK](https://dotnet.microsoft.com/download) version 10.0 or later (the projects target `net10.0`).

### Build

```bash
dotnet build
```

### Run the Sample Host

The sample host demonstrates a server that serves Arrow data and processes background jobs.

```bash
dotnet run --project src/Arrow.Http.SampleHost/Arrow.Http.SampleHost.csproj
```

The host will listen on `http://localhost:5000` (or as configured in `launchSettings.json`).

## Usage Examples

### Server (ASP.NET Core)

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddArrowResponse();          // Adds Arrow serialization services
builder.Services.AddArrowJobs<DemoArrowJobWorker>(); // Optional: add job processing

var app = builder.Build();
app.UseArrowResponse();                       // Enables Arrow middleware
app.MapArrowDemoEndpoints();                  // Sample endpoints (from SampleHost)

app.Run();
```

### Client

```csharp
using var http = new HttpClient();

// Read Arrow data from an endpoint
await using var reader = await http.GetArrowReaderAsync("/arrow");
await foreach (var batch in reader.ReadBatchesAsync())
{
    // Process each RecordBatch
}

// Send Arrow data to an endpoint
await using var writer = http.PostArrowWriterAsync("/arrow");
await writer.WriteBatchAsync(myBatch);
await writer.FlushAsync();
```

### Background Jobs

```csharp
// Submit a job
var job = await http.PostArrowJobAsync("/api/arrow/jobs", new ArrowQueryRequest(
    "inmemory",
    "SELECT * FROM People WHERE Age > @age",
    new Dictionary<string, object?> { ["age"] = 18 }));

// Wait for completion and retrieve results
await foreach (var evt in job.ReadEventsAsync())
{
    if (evt.EventType is ArrowJobEventNames.Completed or ArrowJobEventNames.Failed)
        break;
}

await using var reader = await job.GetArrowReaderAsync();
// Process result batches
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## Acknowledgments

- [Apache Arrow](https://arrow.apache.org/)
- [.NET](https://dotnet.microsoft.com/)