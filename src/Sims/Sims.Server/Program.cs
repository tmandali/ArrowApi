using Sims.Server.Endpoints;
using Sims.Server.Services;
using Sims.Server.Workers;
using Arrow.Jobs.AspNetCore;
using Arrow.Jobs.InMemory;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddArrowApi(arrow =>
{
    // Sonuçlar RAM'de tutulmaz; batch'ler diskteki Arrow IPC dosyasına stream edilir
    // (büyük raporlarda bellek sabit kalır). Global singleton kayıt: bir kez yeterlidir.
    arrow.AddJob<StockAnalyticsArrowJobWorker>("stock-analytics", c => c.UseFileStore("arrow-jobs"));
    arrow.AddJob<StockBalanceArrowJobWorker>("stock-balance", c => c.UseFileStore("arrow-jobs"));
});
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});
builder.Services.AddProblemDetails();
builder.Services.AddSingleton<IStockAnalyticsService, StockAnalyticsService>();
builder.Services.AddSingleton<IStockBalanceService, StockBalanceService>();

var app = builder.Build();

app.UseCors();
app.UseExceptionHandler();
app.UseStatusCodePages();

app.UseDefaultFiles();
app.MapStaticAssets();

app.UseArrowApi("/api/arrow/jobs", jobs =>
{
    jobs.MapJob("stock-analytics").PreventDuplicates(TimeSpan.FromMinutes(30));
    jobs.MapJob("stock-balance").PreventDuplicates(TimeSpan.FromMinutes(30));
});

app.MapStockAnalyticsEndpoints();

app.MapFallbackToFile("/index.html");

app.Run();
