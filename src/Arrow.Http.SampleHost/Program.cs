using Arrow.Http.AspNetCore;
using Arrow.Http.AspNetCore.Dispatcher;
using Arrow.Http.SampleHost;
using Arrow.Jobs.AspNetCore;
using Arrow.Jobs.AspNetCore.Authentication;

var builder = WebApplication.CreateBuilder(args);

// 1. DI Kaydı: Job mantıksal ismiyle kaydolur ("demo", "export-report", "create-product")
builder.Services.AddArrowApi(arrow =>
{
    arrow.AddJob<DemoArrowJobWorker>("demo");
    arrow.AddJob<ExportReportArrowJobWorker>("export-report");
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
        //.RequireRole("Admin", "Developer")
        //.RequireClaim("scope", "jobs:write")
        //.RequireWorkingHours(new TimeOnly(9, 0), new TimeOnly(18, 0))
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

    jobs.MapJob("create-product")
        .RequireAuthorization("DemoJobPolicy");
});

app.MapArrowDemoEndpoints();

app.Run();
