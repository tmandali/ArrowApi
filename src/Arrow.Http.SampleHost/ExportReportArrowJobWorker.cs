using Apache.Arrow;
using Arrow.Jobs;
using System.Runtime.CompilerServices;

namespace Arrow.Http.SampleHost;

public sealed record ExportReportRequest(
    string ReportName,
    Guid SourceJobId) : Arrow.Http.AspNetCore.Dispatcher.IRequest<IAsyncEnumerable<RecordBatch>>;

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
        await _context.PublishInfoAsync($"Generating export report '{request.ReportName}' for source job {request.SourceJobId}", cancellationToken);
        _logger.LogInformation("ExportReportJob running for {ReportName} (SourceJobId: {SourceJobId})", request.ReportName, request.SourceJobId);

        Field[] fields = [new Field("ReportSummary", new Apache.Arrow.Types.StringType(), false)];
        Schema schema = new(fields, null);

        var builder = new StringArray.Builder();
        builder.Append($"Report-{request.ReportName}-{request.SourceJobId}");
        StringArray array = builder.Build();

        RecordBatch batch = new(schema, [array], 1);
        yield return batch;
        await Task.CompletedTask;
    }
}
