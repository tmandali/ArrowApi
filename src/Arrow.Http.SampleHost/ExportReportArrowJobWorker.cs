using Apache.Arrow;
using Arrow.Jobs;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace Arrow.Http.SampleHost;

public sealed record ExportReportRequest(
    string ReportName,
    Guid SourceJobId) : Arrow.Http.AspNetCore.Dispatcher.IRequest<IAsyncEnumerable<RecordBatch>>;

public sealed class ExportReportArrowJobWorker : IArrowJobWorker<ExportReportRequest>
{
    private readonly ILogger<ExportReportArrowJobWorker> _logger;
    private readonly IArrowJobExecutionContext<ExportReportRequest> _context;

    public ExportReportArrowJobWorker(
        ILogger<ExportReportArrowJobWorker> logger,
        IArrowJobExecutionContext<ExportReportRequest> context)
    {
        _logger = logger;
        _context = context;
    }

    public ValueTask<IAsyncEnumerable<RecordBatch>> Handle(
        ExportReportRequest request,
        CancellationToken cancellationToken)
    {
        return ValueTask.FromResult(ExecuteStreamAsync(request, cancellationToken));
    }

    private async IAsyncEnumerable<RecordBatch> ExecuteStreamAsync(
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
