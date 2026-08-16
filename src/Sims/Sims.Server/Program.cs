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
    arrow.AddJob<StockBalanceArrowJobWorker>("stock-balance");
});
builder.Services.AddProblemDetails();
builder.Services.AddSingleton<IStockAnalyticsService, StockAnalyticsService>();
builder.Services.AddSingleton<IStockBalanceService, StockBalanceService>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

app.UseDefaultFiles();
app.MapStaticAssets();

app.UseHttpsRedirection();

app.UseArrowApi("/api/arrow/jobs", jobs =>
{
    jobs.MapJob("stock-analytics");
    jobs.MapJob("stock-balance");
});

app.MapStockAnalyticsEndpoints();

app.MapFallbackToFile("/index.html");

app.Run();
