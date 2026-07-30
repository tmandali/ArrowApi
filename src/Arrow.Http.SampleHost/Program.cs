using Arrow.Http.AspNetCore;
using Arrow.Http.SampleHost;
using Arrow.Jobs.AspNetCore;
using Arrow.Jobs.AspNetCore.Authentication;

var builder = WebApplication.CreateBuilder(args);

// 1. DI Kaydı: Job mantıksal ismiyle kaydolur ("demo")
builder.Services.AddArrowApi(arrow =>
{
    arrow.AddJob<DemoArrowJobWorker>("demo");
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

// 2. HTTP Routing: DemoJobPolicy politikası ile yetkilendirilmiş endpoint'ler
app.UseArrowApi("/api/arrow/jobs", jobs =>
{
    jobs.MapJob("demo")
        .RequireAuthorization("DemoJobPolicy")
        .PreventDuplicates(TimeSpan.FromMinutes(10));
});

app.MapArrowDemoEndpoints();

app.Run();
