using Arrow.Http.AspNetCore;
using Arrow.Http.SampleHost;
using Arrow.Jobs.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddArrowResponse();
builder.Services.AddArrowJob<DemoArrowJobWorker>("/api/arrow/jobs");
//builder.Services.AddOpenTelemetry()
//      .WithTracing(t => t
//          .AddAspNetCoreInstrumentation()   // /api/arrow/jobs, SSE, vs.
//          .AddSource(ArrowJobActivity.SourceName)); // arka plan job'ları


var app = builder.Build();
app.UseArrowApi();
app.MapArrowDemoEndpoints();

app.Run();
