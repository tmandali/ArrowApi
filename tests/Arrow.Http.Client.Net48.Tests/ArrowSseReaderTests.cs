using System.Text;

namespace Arrow.Http.Client.Net48.Tests;

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

        using MemoryStream stream = new(Encoding.UTF8.GetBytes(payload));
        List<ArrowSseItem<string>> items = [];

        await foreach (ArrowSseItem<string> item in ArrowSseReader.ReadAsync(stream))
            items.Add(item);

        Assert.Equal(2, items.Count);
        Assert.Equal("status", items[0].EventType);
        Assert.Equal("{\"status\":\"Running\"}", items[0].Data);
        Assert.Equal("completed", items[1].EventType);
        Assert.Equal("{\"status\":\"Completed\"}", items[1].Data);
    }
}
