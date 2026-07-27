using Apache.Arrow;
using Arrow.Data;
using Arrow.Jobs;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Data;
using System.Data.Common;
using System.Net.Http.Json;

namespace Arrow.Http.Client.Tests;

public class HttpClientArrowExtensionsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public HttpClientArrowExtensionsTests(WebApplicationFactory<Program> factory) => _factory = factory;

    [Fact]
    public async Task GetArrowReaderAsync_reads_people_batches()
    {
        HttpClient http = _factory.CreateClient();

        await using ArrowBatchReader reader = await http.GetArrowReaderAsync("/arrow");
        int batchCount = 0;
        int totalRows = 0;

        await foreach (RecordBatch batch in reader.ReadBatchesAsync())
        {
            batchCount++;
            totalRows += batch.Length;
        }

        Assert.Equal(1, batchCount);
        Assert.Equal(3, totalRows);
        Assert.Equal(["Id", "Name"], reader.Schema.FieldsList.Select(f => f.Name).ToArray());
    }

    [Fact]
    public async Task GetArrowReaderAsync_ReadNextBatchAsync_reads_people_batches()
    {
        HttpClient http = _factory.CreateClient();

        await using ArrowBatchReader reader = await http.GetArrowReaderAsync("/arrow");
        int batchCount = 0;
        int totalRows = 0;

        while (await reader.ReadNextBatchAsync() is { } batch)
        {
            batchCount++;
            totalRows += batch.Length;
        }

        Assert.Equal(1, batchCount);
        Assert.Equal(3, totalRows);
        Assert.Equal(["Id", "Name"], reader.Schema.FieldsList.Select(f => f.Name).ToArray());
    }

    [Fact]
    public async Task GetArrowReaderAsync_ReadNextBatchAsync_reads_multiple_batches()
    {
        HttpClient http = _factory.CreateClient();

        await using ArrowBatchReader reader = await http.GetArrowReaderAsync("/arrow/manual");
        int batchCount = 0;
        int totalRows = 0;

        while (await reader.ReadNextBatchAsync() is { } batch)
        {
            batchCount++;
            totalRows += batch.Length;
        }

        Assert.Equal(2, batchCount);
        Assert.Equal(3, totalRows);
    }

    [Fact]
    public async Task GetArrowBatchSummaryAsync_returns_metadata()
    {
        HttpClient http = _factory.CreateClient();

        ArrowBatchSummary summary = await http.GetArrowBatchSummaryAsync("/arrow/batches");

        Assert.Equal(1, summary.BatchCount);
        Assert.Equal(3, summary.TotalRows);
        Assert.Equal("Id", summary.Columns[0].Name);
    }

    [Fact]
    public async Task GetArrowBatches_with_accept_arrow_returns_ipc_stream()
    {
        HttpClient http = _factory.CreateClient();

        HttpRequestMessage request = new(HttpMethod.Get, "/arrow/batches");
        request.Headers.Accept.ParseAdd(ArrowMediaTypes.Stream);

        using HttpResponseMessage response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        await using ArrowBatchReader reader = await response.ReadAsArrowBatchReaderAsync();

        int totalRows = 0;
        while (await reader.ReadNextBatchAsync() is { } batch)
            totalRows += batch.Length;

        Assert.Equal(3, totalRows);
    }

    [Fact]
    public async Task GetArrowReaderAsync_reads_db_source_endpoint()
    {
        HttpClient http = _factory.CreateClient();

        await using ArrowBatchReader reader = await http.GetArrowReaderAsync("/arrow/db-source");
        int totalRows = 0;

        while (await reader.ReadNextBatchAsync() is { } batch)
            totalRows += batch.Length;

        Assert.Equal(3, totalRows);
    }

    [Fact]
    public async Task GetArrowReaderAsync_reads_variant_column()
    {
        HttpClient http = _factory.CreateClient();

        await using ArrowBatchReader reader = await http.GetArrowReaderAsync("/arrow/variant/manual");
        await foreach (RecordBatch batch in reader.ReadBatchesAsync())
        {
            VariantArray eventData = VariantBatches.GetVariantColumn(batch, "event_data");
            Assert.Equal(2, eventData.Length);
            Assert.Equal(42L, eventData.GetVariantValue(0).AsObject()["user_id"].AsInt64());
        }
    }

    [Fact]
    public async Task PostArrowWriterAsync_WriteBatchAsync_forwards_batches()
    {
        HttpClient http = _factory.CreateClient();

        await using ArrowBatchReader reader = await http.GetArrowReaderAsync("/arrow");
        await using ArrowBatchWriter writer = http.PostArrowWriterAsync("/arrow");

        int batchCount = 0;
        int totalRows = 0;

        while (await reader.ReadNextBatchAsync() is { } batch)
        {
            await writer.WriteBatchAsync(batch);
            batchCount++;
            totalRows += batch.Length;
        }

        Assert.Equal(1, batchCount);
        Assert.Equal(3, totalRows);
    }

    [Fact]
    public async Task WriteArrowAsync_posts_without_reading_arrow_response()
    {
        HttpClient http = _factory.CreateClient();
        await using ArrowBatchReader source = await http.GetArrowReaderAsync("/arrow");

        await http.WriteArrowAsync("/arrow", source);
    }

    [Fact]
    public async Task PostArrowReaderAsync_echoes_batches_via_reader()
    {
        HttpClient http = _factory.CreateClient();

        await using ArrowBatchReader source = await http.GetArrowReaderAsync("/arrow");
        await using ArrowBatchReader echoed = await http.PostArrowReaderAsync("/arrow", source);

        int totalRows = 0;
        await foreach (RecordBatch batch in echoed.ReadBatchesAsync())
            totalRows += batch.Length;

        Assert.Equal(3, totalRows);
        Assert.Equal(["Id", "Name"], echoed.Schema.FieldsList.Select(f => f.Name).ToArray());
    }

    [Fact]
    public async Task GetDbDataReaderAsync_reads_rows()
    {
        HttpClient http = _factory.CreateClient();

        await using ArrowDataReader db = await http.GetDbDataReaderAsync("/arrow");
        var names = new List<string>();
        while (await db.ReadAsync())
            names.Add(db.GetString(db.GetOrdinal("Name")));

        Assert.Equal(["Ali", "Ayşe", "Veli"], names);
    }

    [Fact]
    public async Task PostDbDataReaderAsync_echoes_rows()
    {
        HttpClient http = _factory.CreateClient();
        using DataTable table = CreatePeopleTable();
        await using DbDataReader source = table.CreateDataReader();

        await using ArrowDataReader db = await http.PostDbDataReaderAsync("/arrow", source);
        var names = new List<string>();
        while (await db.ReadAsync())
            names.Add(db.GetString(db.GetOrdinal("Name")));

        Assert.Equal(["Ali", "Ayşe", "Veli"], names);
    }

    [Fact]
    public async Task HttpResponse_ReadAsArrowDataReaderAsync_reads_rows()
    {
        HttpClient http = _factory.CreateClient();
        HttpRequestMessage request = new(HttpMethod.Get, "/arrow");
        request.Headers.Accept.ParseAdd(ArrowMediaTypes.Stream);

        using HttpResponseMessage response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        await using ArrowDataReader db = await response.ReadAsArrowDataReaderAsync();

        var names = new List<string>();
        while (await db.ReadAsync())
            names.Add(db.GetString(db.GetOrdinal("Name")));

        Assert.Equal(["Ali", "Ayşe", "Veli"], names);
    }

    [Fact]
    public async Task HttpContent_ToArrowHttpContent_posts_and_reads_response()
    {
        HttpClient http = _factory.CreateClient();
        await using ArrowBatchReader source = await http.GetArrowReaderAsync("/arrow");

        HttpRequestMessage request = new(HttpMethod.Post, "/arrow")
        {
            Content = source.ToArrowHttpContent()
        };
        request.Headers.Accept.ParseAdd(ArrowMediaTypes.Stream);

        using HttpResponseMessage response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        await using ArrowDataReader db = await response.ReadAsArrowDataReaderAsync();

        int rowCount = 0;
        while (await db.ReadAsync())
            rowCount++;

        Assert.Equal(3, rowCount);
    }

    [Fact]
    public async Task IAsyncEnumerable_ToArrowHttpContent_posts_batches_without_schema_param()
    {
        HttpClient http = _factory.CreateClient();
        await using ArrowBatchReader source = await http.GetArrowReaderAsync("/arrow");

        using HttpResponseMessage response = await http.PostAsync(
            "/arrow",
            source.ReadBatchesAsync().ToArrowHttpContent());
        await using ArrowDataReader db = await response.ReadAsArrowDataReaderAsync();

        int rowCount = 0;
        while (await db.ReadAsync())
            rowCount++;

        Assert.Equal(3, rowCount);
    }

    [Fact]
    public async Task IAsyncEnumerable_ToArrowHttpContent_empty_with_schema_posts_zero_rows()
    {
        HttpClient http = _factory.CreateClient();
        await using ArrowBatchReader source = await http.GetArrowReaderAsync("/arrow");
        Schema schema = source.Schema;

        using HttpResponseMessage response = await http.PostAsync(
            "/arrow",
            EmptyBatches().ToArrowHttpContent(schema));
        await using ArrowDataReader db = await response.ReadAsArrowDataReaderAsync();

        Assert.Equal(["Id", "Name"], db.Schema.FieldsList.Select(f => f.Name).ToArray());
        Assert.False(await db.ReadAsync());
    }

    [Fact]
    public async Task IAsyncEnumerable_ToArrowHttpContent_empty_without_schema_throws()
    {
        HttpContent content = EmptyBatches().ToArrowHttpContent();
        using MemoryStream stream = new();

        await Assert.ThrowsAsync<InvalidOperationException>(() => content.CopyToAsync(stream));
    }

    [Fact]
    public async Task Json_post_request_reads_arrow_data_reader_response()
    {
        HttpClient http = _factory.CreateClient();

        HttpRequestMessage request = new(HttpMethod.Post, "/arrow/query")
        {
            Content = JsonContent.Create(new ArrowQueryRequest(
                "inmemory",
                "SELECT * FROM People LIMIT @limit",
                new Dictionary<string, object?> { ["limit"] = 2 }))
        };
        request.Headers.Accept.ParseAdd(ArrowMediaTypes.Stream);

        using HttpResponseMessage response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        await using ArrowDataReader db = await response.ReadAsArrowDataReaderAsync();

        var names = new List<string>();
        while (await db.ReadAsync())
            names.Add(db.GetString(db.GetOrdinal("Name")));

        Assert.Equal(["Ali", "Ayşe"], names);
    }

    [Fact]
    public async Task Json_post_query_request_honors_batch_size()
    {
        HttpClient http = _factory.CreateClient();

        HttpRequestMessage request = new(HttpMethod.Post, "/arrow/query")
        {
            Content = JsonContent.Create(new ArrowQueryRequest(
                "inmemory",
                "SELECT * FROM People LIMIT @limit",
                new Dictionary<string, object?> { ["limit"] = 3 },
                BatchSize: 1))
        };
        request.Headers.Accept.ParseAdd(ArrowMediaTypes.Stream);

        using HttpResponseMessage response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        await using ArrowBatchReader reader = await response.ReadAsArrowBatchReaderAsync();

        int batchCount = 0;
        int totalRows = 0;

        while (await reader.ReadNextBatchAsync() is { } batch)
        {
            batchCount++;
            totalRows += batch.Length;
        }

        Assert.Equal(3, batchCount);
        Assert.Equal(3, totalRows);
    }

    [Fact]
    public async Task Custom_json_request_reads_arrow_batch_summary_response()
    {
        HttpClient http = _factory.CreateClient();

        using HttpResponseMessage response = await http.GetAsync("/arrow/batches");
        ArrowBatchSummary summary = await response.ReadAsArrowBatchSummaryAsync();

        Assert.Equal(3, summary.TotalRows);
    }

    [Fact]
    public async Task Background_query_job_writes_parquet_and_returns_arrow()
    {
        HttpClient http = _factory.CreateClient();

        ArrowJob job = await http.PostArrowJobAsync(
            "/api/arrow/jobs",
            new ArrowQueryRequest(
                "inmemory",
                "SELECT * FROM People LIMIT @limit",
                new Dictionary<string, object?> { ["limit"] = 2 }));

        await foreach (ArrowSseItem<ArrowJobEvent> item in job.ReadEventsAsync())
        {
            if (item.EventType is ArrowJobEventNames.Completed or ArrowJobEventNames.Failed)
                break;
        }

        await using ArrowBatchReader reader = await job.GetArrowReaderAsync();
        int totalRows = 0;

        while (await reader.ReadNextBatchAsync() is { } batch)
            totalRows += batch.Length;

        Assert.Equal(2, totalRows);
    }

    [Fact]
    public async Task Background_query_job_sse_waits_until_completed()
    {
        HttpClient http = _factory.CreateClient();

        ArrowJob job = await http.PostArrowJobAsync(
            "/api/arrow/jobs",
            new ArrowQueryRequest(
                "inmemory",
                "SELECT * FROM People LIMIT @limit",
                new Dictionary<string, object?> { ["limit"] = 2 }));

        ArrowJobEvent? finalEvent = null;

        await foreach (ArrowSseItem<ArrowJobEvent> item in job.ReadEventsAsync())
        {
            finalEvent = item.Data;

            if (item.EventType is ArrowJobEventNames.Completed or ArrowJobEventNames.Failed)
                break;
        }

        Assert.NotNull(finalEvent);
        Assert.Equal("Completed", finalEvent.Status);
        Assert.Equal(job.JobUrl, finalEvent.JobUrl);

        await using ArrowBatchReader reader = await job.GetArrowReaderAsync();
        int totalRows = 0;

        while (await reader.ReadNextBatchAsync() is { } batch)
            totalRows += batch.Length;

        Assert.Equal(2, totalRows);
    }

    private static async IAsyncEnumerable<RecordBatch> EmptyBatches()
    {
        await Task.CompletedTask;
        yield break;
    }

    private static DataTable CreatePeopleTable()
    {
        DataTable table = new();
        table.Columns.Add("Id", typeof(int));
        table.Columns.Add("Name", typeof(string));
        table.Rows.Add(1, "Ali");
        table.Rows.Add(2, "Ayşe");
        table.Rows.Add(3, "Veli");
        return table;
    }
}
