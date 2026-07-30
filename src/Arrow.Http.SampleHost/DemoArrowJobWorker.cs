using Apache.Arrow;
using Arrow.Data;
using Arrow.Jobs;
using System.Data.Common;
using System.Runtime.CompilerServices;

namespace Arrow.Http.SampleHost;

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
        await _context.PublishInfoAsync($"Sorgu başlıyor: {request.Query}", cancellationToken);

        await Task.Delay(TimeSpan.FromMilliseconds(300), cancellationToken);

        await using DbDataReader reader = ArrowSamples.OpenDemoQueryReader(request.Query, request.Parameters);
        ArrowConversionOptions? options = ArrowSamples.CreateConversionOptions(request.BatchSize);
        await using ArrowBatchReader arrowReader = ArrowData.OpenArrowReader(reader, options);

        await foreach (RecordBatch batch in arrowReader.ReadBatchesAsync(cancellationToken))
            yield return batch;

        await _context.PublishInfoAsync("Sorgu tamamlandı, zincirdeki export-report job'ı tetikleniyor...", cancellationToken);
        var report = await _context.EnqueueNextJobAsync(
            "export-report",
            new ExportReportRequest("DemoReport"),
            cancellationToken: cancellationToken);

        // _context üzerinden doğrudan okunur (otomatik bekler ve stream eder)
        await foreach (RecordBatch reportBatch in _context.ReadBatchesAsync(report, cancellationToken: cancellationToken))
        {
            // Alt job sonuç batch'leri işlenebilir
        }
    }
}
