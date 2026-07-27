using System.Text;

namespace Arrow.Http.Client.Tests;

public class ArrowSseReaderTests
{
    [Fact]
    public async Task ReadAsync_parses_event_data_and_ignores_comments()
    {
        const string payload =
            ": keep-alive\n\n" +
            "event: status\n" +
            "data: {\"status\":\"Running\"}\n\n" +
            "event: completed\n" +
            "data: {\"status\":\"Completed\"}\n\n";

        await using MemoryStream stream = new(Encoding.UTF8.GetBytes(payload));
        List<ArrowSseItem<string>> items = [];

        await foreach (ArrowSseItem<string> item in ArrowSseReader.ReadAsync(stream))
            items.Add(item);

        Assert.Equal(2, items.Count);
        Assert.Equal("status", items[0].EventType);
        Assert.Equal("{\"status\":\"Running\"}", items[0].Data);
        Assert.Equal("completed", items[1].EventType);
        Assert.Equal("{\"status\":\"Completed\"}", items[1].Data);
    }

    [Fact]
    public async Task ReadAsync_joins_multiline_data()
    {
        const string payload =
            "event: status\n" +
            "data: line1\n" +
            "data: line2\n\n";

        await using MemoryStream stream = new(Encoding.UTF8.GetBytes(payload));
        List<ArrowSseItem<string>> items = [];

        await foreach (ArrowSseItem<string> item in ArrowSseReader.ReadAsync(stream))
            items.Add(item);

        Assert.Single(items);
        Assert.Equal("line1\nline2", items[0].Data);
    }
}
