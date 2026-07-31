using Apache.Arrow;
using Arrow.Data;
using Arrow.Jobs;
using System.Runtime.CompilerServices;

namespace Arrow.Http.SampleHost;

public sealed record ExportReportRequest(
    string ReportName) : AspNetCore.Dispatcher.IRequest<IAsyncEnumerable<RecordBatch>>;

public sealed class ExportReportArrowJobWorker : IArrowJobWorker<ExportReportRequest>
{
    private readonly ILogger<ExportReportArrowJobWorker> _logger;
    private readonly IArrowJobExecutionContext _context;

    public ExportReportArrowJobWorker(
        ILogger<ExportReportArrowJobWorker> logger,
        IArrowJobExecutionContext context)
    {
        _logger = logger;
        _context = context;
    }

    public async IAsyncEnumerable<RecordBatch> Handle(
        ExportReportRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await _context.PublishInfoAsync($"Generating export report '{request.ReportName}' for job {_context.JobId} (ParentJobId: {_context.ParentJobId})", cancellationToken);
        _logger.LogInformation("ExportReportJob running for {ReportName} (JobId: {JobId}, ParentJobId: {ParentJobId})", request.ReportName, _context.JobId, _context.ParentJobId);

        // Sub-worker parent'tan Arrow verisini okur (Pipe / Parent Stream)
        Result<ArrowBatchReader> parentData = await _context.GetParentArrowReaderAsync(cancellationToken);
        int parentRowCount = 0;

        // request.ReportName.IsJob(...) extension metodu ile kontrat ismi kontrolü:
        if (request.ReportName.IsJob("DemoReport") || request.ReportName.IsJob("Marmara"))
        {
            await foreach (IReadOnlyList<DemoReportDto> parentBatch in parentData.ReadBatchesAsync<DemoReportDto>(cancellationToken))
            {
                parentRowCount += parentBatch.Count;
            }
        }
        else
        {
            // Genel varsayılan okuma
            await foreach (IReadOnlyList<DemoReportDto> parentBatch in parentData.ReadBatchesAsync<DemoReportDto>(cancellationToken))
            {
                parentRowCount += parentBatch.Count;
            }
        }

        Field[] fields = [new Field("ReportSummary", new Apache.Arrow.Types.StringType(), false)];
        Schema schema = new(fields, null);

        var builder = new StringArray.Builder();
        builder.Append($"Report-{request.ReportName}-Processed-{parentRowCount}-ParentRows");
        StringArray array = builder.Build();

        RecordBatch batch = new(schema, [array], 1);
        yield return batch;
    }
}

public record DemoReportDto(int Id, string Name);
