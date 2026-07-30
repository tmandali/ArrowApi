using Apache.Arrow;
using Arrow.Data;
using Arrow.Jobs;
using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace Arrow.Http.SampleHost;

public sealed class DemoArrowJobWorker : IArrowJobWorker<ArrowQueryRequest>
{
    private readonly IArrowJobExecutionContext<ArrowQueryRequest> _context;

    public DemoArrowJobWorker(IArrowJobExecutionContext<ArrowQueryRequest> context)
    {
        _context = context;
    }

    public ValueTask<IAsyncEnumerable<RecordBatch>> Handle(
        ArrowQueryRequest request,
        CancellationToken cancellationToken)
    {
        return ValueTask.FromResult(ExecuteStreamAsync(request, cancellationToken));
    }

    private async IAsyncEnumerable<RecordBatch> ExecuteStreamAsync(
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
        await _context.EnqueueNextJobAsync(
            "export-report",
            new ExportReportRequest("DemoReport", _context.JobId),
            cancellationToken: cancellationToken);
    }
}
