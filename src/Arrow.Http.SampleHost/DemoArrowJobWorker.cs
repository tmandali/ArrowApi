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

        // _context / job üzerinden ArrowBatchReader alınır (otomatik bekler ve ArrowBatchReader döndürür)
        await using ArrowBatchReader reportReader = await report.GetArrowReaderAsync(_context, cancellationToken: cancellationToken);

        while (await reportReader.ReadNextBatchAsync(cancellationToken) is { } reportBatch)
            using(reportBatch)
            {
                //var idArray = (Int32Array)batch.Column("Id");
                //var nameArray = (StringArray)batch.Column("Name");

                //var list = new List<MyReportDto>(batch.Length);

                //for (int i = 0; i < batch.Length; i++)
                //{
                //    list.Add(new MyReportDto
                //    {
                //        Id = idArray.GetValue(i)!.Value,
                //        Name = nameArray.GetString(i)
                //    });
                //}

                // Alt job sonuç batch'leri işlenebilir
                //reportBatch.Dispose();
            }
    }
}
