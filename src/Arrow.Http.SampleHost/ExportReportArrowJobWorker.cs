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
    Guid SourceJobId);

public sealed class ExportReportArrowJobWorker : IArrowJobWorker<ExportReportRequest>
{
    private readonly ILogger<ExportReportArrowJobWorker> _logger;

    public ExportReportArrowJobWorker(ILogger<ExportReportArrowJobWorker> logger)
    {
        _logger = logger;
    }

    public async IAsyncEnumerable<RecordBatch> ExecuteJobAsync(
        IArrowJobExecutionContext<ExportReportRequest> context,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await context.PublishInfoAsync($"Generating export report '{context.Request.ReportName}' for source job {context.Request.SourceJobId}", cancellationToken);
        _logger.LogInformation("ExportReportJob running for {ReportName} (SourceJobId: {SourceJobId})", context.Request.ReportName, context.Request.SourceJobId);

        Field[] fields = [new Field("ReportSummary", new Apache.Arrow.Types.StringType(), false)];
        Schema schema = new(fields, null);

        var builder = new StringArray.Builder();
        builder.Append($"Report-{context.Request.ReportName}-{context.Request.SourceJobId}");
        StringArray array = builder.Build();

        RecordBatch batch = new(schema, [array], 1);
        yield return batch;
        await Task.CompletedTask;
    }
}
