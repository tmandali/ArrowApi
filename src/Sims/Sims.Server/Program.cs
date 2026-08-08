using Sims.Server.Endpoints;
using Sims.Server.Services;
using Sims.Server.Workers;
using Arrow.Jobs.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddArrowApi(arrow =>
{
    arrow.AddJob<StockAnalyticsArrowJobWorker>("stock-analytics");
    arrow.AddJob<StockBalanceArrowJobWorker>("stock-balance");
});
builder.Services.AddSingleton<IStockAnalyticsService, StockAnalyticsService>();
builder.Services.AddSingleton<IStockBalanceService, StockBalanceService>();

var app = builder.Build();

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
