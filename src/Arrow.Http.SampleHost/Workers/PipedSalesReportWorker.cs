using System.Data;
using System.Data.Common;
using System.Runtime.CompilerServices;
using Apache.Arrow;
using Arrow.Data;
using Arrow.Jobs;

namespace Arrow.Http.SampleHost.Workers;

public sealed record PipedSalesReportRequest(string Region) : AspNetCore.Dispatcher.IRequest<IAsyncEnumerable<RecordBatch>>;

/// <summary>
/// Parent Job: Veritabanından okuduğu verileri aynı DI Scope ve aynı DbContext içinde 
/// Pipe (boru hattı) ile 'export-report' alt işçisine aktarır.
/// </summary>
public sealed class PipedSalesReportWorker : IArrowJobWorker<PipedSalesReportRequest>
{
    private readonly IArrowJobExecutionContext _context;

    public PipedSalesReportWorker(IArrowJobExecutionContext context)
    {
        _context = context;
    }

    public async IAsyncEnumerable<RecordBatch> Handle(
        PipedSalesReportRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await _context.PublishInfoAsync($"Bölge satış raporu Pipe akışı başlatılıyor: {request.Region}", cancellationToken);

        // 1. Veritabanı sorgusu simülasyonu
        using DataTable table = ArrowSamples.CreatePeopleTable();
        await using DbDataReader dbReader = table.CreateDataReader();
        await using ArrowBatchReader arrowReader = dbReader.OpenArrowReader();

        IAsyncEnumerable<RecordBatch> sourceStream = arrowReader.ReadBatchesAsync(cancellationToken);

        // 2. Paket akışını Pipe (boru hattı) ile 'export-report' alt worker'ına aktar (Aynı Scope & DbContext):
        await foreach (RecordBatch reportBatch in _context.PipeToAsync("export-report", new ExportReportRequest(request.Region), sourceStream, cancellationToken))
        {
            yield return reportBatch;
        }

        await _context.PublishInfoAsync("Bölge satış raporu ve Pipe alt işçisi başarıyla tamamlandı.", cancellationToken);
    }
}
