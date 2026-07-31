using Arrow.Http.AspNetCore;
using Arrow.Http.SampleHost;
using Arrow.Http.SampleHost.Workers;
using Arrow.Jobs.AspNetCore;
using Arrow.Jobs.AspNetCore.Authentication;

var builder = WebApplication.CreateBuilder(args);

// 1. DI Kaydı: Job mantıksal ismiyle kaydolur ("demo", "export-report", "piped-sales-report", "create-product")
builder.Services.AddArrowApi(arrow =>
{
    arrow.AddJob<DemoArrowJobWorker>("demo");
    arrow.AddJob<ExportReportArrowJobWorker>("export-report");
    arrow.AddJob<PipedSalesReportWorker>("piped-sales-report");
    arrow.AddJob<CreateProductCqrsCommandHandler>("create-product");
});

builder.Services.AddStaticApiKeyAuthentication(o =>
{
    o.ApiKey = builder.Configuration["Arrow:ApiKey"] ?? "dev-secret";
    o.ClientId = "static-client";
});

// DemoJobPolicy politikasını tanımlıyoruz:
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("DemoJobPolicy", policy => policy
        .RequireAuthenticatedUser());
});

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

// 3. HTTP Routing: DemoJobPolicy politikası ile yetkilendirilmiş endpoint'ler
app.UseArrowApi("/api/arrow/jobs", jobs =>
{
    jobs.MapJob("demo")
        .RequireAuthorization("DemoJobPolicy")
        .PreventDuplicates(TimeSpan.FromMinutes(10));

    jobs.MapJob("export-report")
        .RequireAuthorization("DemoJobPolicy");

    jobs.MapJob("piped-sales-report")
        .RequireAuthorization("DemoJobPolicy");

    jobs.MapJob("create-product")
        .RequireAuthorization("DemoJobPolicy");
});

app.MapArrowDemoEndpoints();

app.Run();
