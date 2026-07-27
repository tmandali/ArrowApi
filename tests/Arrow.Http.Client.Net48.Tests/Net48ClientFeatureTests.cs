using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Types;
using Arrow.Data;
using Arrow.Jobs;
using System.Data;
using System.Data.Common;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;

namespace Arrow.Http.Client.Net48.Tests;

/// <summary>
/// net48 üzerinde HttpClient + Arrow.Http.Client job/SSE/Arrow yollarını mock HTTP ile doğrular.
/// (SampleHost net10 olduğu için WebApplicationFactory kullanılamaz.)
/// </summary>
public class Net48ClientFeatureTests
{
    [Fact]
    public async Task PostArrowJob_ReadEvents_GetArrowReader_works_on_net48()
    {
        Guid jobId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        const string jobsUri = "http://test/api/arrow/jobs";
        string jobUrl = $"http://test/api/arrow/jobs/{jobId:D}";
        string eventsUrl = $"{jobUrl}/events";

        byte[] arrowBytes = await CreatePeopleArrowStreamAsync();

        using StubHandler handler = new(async (request, body, _) =>
        {
            string path = request.RequestUri!.AbsoluteUri;

            if (request.Method == HttpMethod.Post && path == jobsUri)
            {
                string json =
                    $"{{\"id\":\"{jobId:D}\",\"status\":\"Queued\",\"jobUrl\":\"{jobUrl}\",\"eventsUrl\":\"{eventsUrl}\"}}";
                return JsonResponse(HttpStatusCode.Accepted, json);
            }

            if (request.Method == HttpMethod.Get && path == eventsUrl)
            {
                string sse =
                    "event: status\n" +
                    $"data: {{\"id\":\"{jobId:D}\",\"status\":\"Running\",\"jobUrl\":\"{jobUrl}\",\"eventsUrl\":\"{eventsUrl}\"}}\n\n" +
                    "event: completed\n" +
                    $"data: {{\"id\":\"{jobId:D}\",\"status\":\"Completed\",\"jobUrl\":\"{jobUrl}\",\"eventsUrl\":\"{eventsUrl}\"}}\n\n";
                HttpResponseMessage response = new(HttpStatusCode.OK)
                {
                    Content = new StringContent(sse, Encoding.UTF8)
                };
                response.Content.Headers.ContentType = new MediaTypeHeaderValue("text/event-stream");
                return response;
            }

            if (request.Method == HttpMethod.Get && path == jobUrl)
            {
                HttpResponseMessage response = new(HttpStatusCode.OK)
                {
                    Content = new ByteArrayContent(arrowBytes)
                };
                response.Content.Headers.ContentType = new MediaTypeHeaderValue(ArrowMediaTypes.Stream);
                return response;
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        using HttpClient http = new(handler) { BaseAddress = new Uri("http://test/") };

        ArrowJob job = await http.PostArrowJobAsync(
            jobsUri,
            new ArrowQueryRequest("inmemory", "SELECT 1", new Dictionary<string, object?>()));

        Assert.Equal(jobId, job.Id);
        Assert.Equal(jobUrl, job.JobUrl);

        ArrowJobEvent? final = null;
        await foreach (ArrowSseItem<ArrowJobEvent> item in job.ReadEventsAsync())
        {
            final = item.Data;
            if (item.EventType is ArrowJobEventNames.Completed or ArrowJobEventNames.Failed)
                break;
        }

        Assert.NotNull(final);
        Assert.Equal("Completed", final!.Status);

        await using ArrowBatchReader reader = await job.GetArrowReaderAsync();
        int totalRows = 0;
        while (await reader.ReadNextBatchAsync() is { } batch)
        {
            totalRows += batch.Length;
            batch.Dispose();
        }

        Assert.Equal(2, totalRows);
    }

    [Fact]
    public async Task GetArrowReaderAsync_reads_ipc_stream_on_net48()
    {
        byte[] arrowBytes = await CreatePeopleArrowStreamAsync();

        using StubHandler handler = new((_, _, _) =>
        {
            HttpResponseMessage response = new(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(arrowBytes)
            };
            response.Content.Headers.ContentType = new MediaTypeHeaderValue(ArrowMediaTypes.Stream);
            return Task.FromResult(response);
        });

        using HttpClient http = new(handler) { BaseAddress = new Uri("http://test/") };
        await using ArrowBatchReader reader = await http.GetArrowReaderAsync("http://test/arrow");

        int totalRows = 0;
        await foreach (RecordBatch batch in reader.ReadBatchesAsync())
        {
            totalRows += batch.Length;
            batch.Dispose();
        }

        Assert.Equal(2, totalRows);
    }

    [Fact]
    public async Task WriteArrowAsync_posts_ipc_body_on_net48()
    {
        byte[]? postedBody = null;
        string? contentType = null;

        using StubHandler handler = new((request, body, _) =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            postedBody = body;
            contentType = request.Content?.Headers.ContentType?.MediaType;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NoContent));
        });

        using HttpClient http = new(handler) { BaseAddress = new Uri("http://test/") };
        await using ArrowBatchReader source = OpenPeopleReader(await CreatePeopleArrowStreamAsync());

        await http.WriteArrowAsync("http://test/arrow", source);

        Assert.Equal(ArrowMediaTypes.Stream, contentType);
        Assert.NotNull(postedBody);
        Assert.Equal(2, await CountRowsAsync(postedBody!));
    }

    [Fact]
    public async Task PostArrowWriterAsync_WriteBatchAsync_posts_ipc_on_net48()
    {
        byte[]? postedBody = null;

        using StubHandler handler = new((request, body, _) =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            postedBody = body;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NoContent));
        });

        using HttpClient http = new(handler) { BaseAddress = new Uri("http://test/") };
        await using ArrowBatchReader source = OpenPeopleReader(await CreatePeopleArrowStreamAsync());

        int batchCount = 0;
        int totalRows = 0;
        await using (ArrowBatchWriter writer = http.PostArrowWriterAsync("http://test/arrow"))
        {
            while (await source.ReadNextBatchAsync() is { } batch)
            {
                await writer.WriteBatchAsync(batch);
                batchCount++;
                totalRows += batch.Length;
                batch.Dispose();
            }
        }

        Assert.Equal(1, batchCount);
        Assert.Equal(2, totalRows);
        Assert.NotNull(postedBody);
        Assert.Equal(2, await CountRowsAsync(postedBody!));
    }

    [Fact]
    public async Task GetDbDataReaderAsync_reads_rows_on_net48()
    {
        byte[] arrowBytes = await CreatePeopleArrowStreamAsync();

        using StubHandler handler = new((_, _, _) =>
        {
            HttpResponseMessage response = new(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(arrowBytes)
            };
            response.Content.Headers.ContentType = new MediaTypeHeaderValue(ArrowMediaTypes.Stream);
            return Task.FromResult(response);
        });

        using HttpClient http = new(handler) { BaseAddress = new Uri("http://test/") };
        await using ArrowDataReader db = await http.GetDbDataReaderAsync("http://test/arrow");

        List<string> names = [];
        while (await db.ReadAsync())
            names.Add(db.GetString(db.GetOrdinal("Name")));

        Assert.Equal(["Ada", "Bob"], names);
    }

    [Fact]
    public async Task PostDbDataReaderAsync_posts_and_reads_rows_on_net48()
    {
        byte[]? postedBody = null;

        using StubHandler handler = new((request, body, _) =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            postedBody = body;
            HttpResponseMessage response = new(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(body ?? System.Array.Empty<byte>())
            };
            response.Content.Headers.ContentType = new MediaTypeHeaderValue(ArrowMediaTypes.Stream);
            return Task.FromResult(response);
        });

        using HttpClient http = new(handler) { BaseAddress = new Uri("http://test/") };
        using DataTable table = CreatePeopleTable();
        using DbDataReader source = table.CreateDataReader();

        await using ArrowDataReader db = await http.PostDbDataReaderAsync("http://test/arrow", source);

        List<string> names = [];
        while (await db.ReadAsync())
            names.Add(db.GetString(db.GetOrdinal("Name")));

        Assert.Equal(["Ada", "Bob"], names);
        Assert.NotNull(postedBody);
        Assert.Equal(2, await CountRowsAsync(postedBody!));
    }

    [Fact]
    public async Task WriteArrowAsync_from_DbDataReader_posts_ipc_on_net48()
    {
        byte[]? postedBody = null;

        using StubHandler handler = new((request, body, _) =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            postedBody = body;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NoContent));
        });

        using HttpClient http = new(handler) { BaseAddress = new Uri("http://test/") };
        using DataTable table = CreatePeopleTable();
        using DbDataReader source = table.CreateDataReader();

        await http.WriteArrowAsync("http://test/arrow", source);

        Assert.NotNull(postedBody);
        Assert.Equal(2, await CountRowsAsync(postedBody!));
    }

    private static DataTable CreatePeopleTable()
    {
        DataTable table = new();
        table.Columns.Add("Id", typeof(int));
        table.Columns.Add("Name", typeof(string));
        table.Rows.Add(1, "Ada");
        table.Rows.Add(2, "Bob");
        return table;
    }

    private static ArrowBatchReader OpenPeopleReader(byte[] arrowBytes) =>
        ArrowData.OpenArrowReader(new MemoryStream(arrowBytes), leaveOpen: false);

    private static async Task<int> CountRowsAsync(byte[] arrowBytes)
    {
        await using ArrowBatchReader reader = ArrowData.OpenArrowReader(new MemoryStream(arrowBytes), leaveOpen: false);

        int totalRows = 0;
        await foreach (RecordBatch batch in reader.ReadBatchesAsync())
        {
            totalRows += batch.Length;
            batch.Dispose();
        }

        return totalRows;
    }

    private static async Task<byte[]> CreatePeopleArrowStreamAsync()
    {
        Field id = new("Id", Int32Type.Default, nullable: false);
        Field name = new("Name", StringType.Default, nullable: false);
        Schema schema = new([id, name], metadata: null);

        Int32Array ids = new Int32Array.Builder().Append(1).Append(2).Build();
        StringArray names = new StringArray.Builder().Append("Ada").Append("Bob").Build();
        using RecordBatch batch = new(schema, [ids, names], length: 2);

        using MemoryStream ms = new();
        using (ArrowStreamWriter writer = new(ms, schema, leaveOpen: true))
        {
            await writer.WriteStartAsync();
            await writer.WriteRecordBatchAsync(batch);
            await writer.WriteEndAsync();
        }

        return ms.ToArray();
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode code, string json)
    {
        HttpResponseMessage response = new(code)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        return response;
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, byte[]?, CancellationToken, Task<HttpResponseMessage>> _handler;

        public StubHandler(Func<HttpRequestMessage, byte[]?, CancellationToken, Task<HttpResponseMessage>> handler) =>
            _handler = handler;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            byte[]? body = null;
            if (request.Content is not null)
            {
                using MemoryStream ms = new();
                await request.Content.CopyToAsync(ms).ConfigureAwait(false);
                body = ms.ToArray();
            }

            return await _handler(request, body, cancellationToken).ConfigureAwait(false);
        }
    }
}
