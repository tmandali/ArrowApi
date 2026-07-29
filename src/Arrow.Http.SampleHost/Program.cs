using Arrow.Http.AspNetCore;
using Arrow.Http.SampleHost;
using Arrow.Jobs.AspNetCore;
using Arrow.Jobs.AspNetCore.Authentication;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddArrowResponse();
builder.Services.AddArrowJob<DemoArrowJobWorker>("/api/arrow/jobs");
builder.Services.AddStaticApiKeyAuthentication(o =>
{
    o.ApiKey = builder.Configuration["Arrow:ApiKey"] ?? "dev-secret";
    o.ClientId = "static-client";
});

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.UseArrowApi();
app.MapArrowDemoEndpoints();
//.RequireAuthorization() job group'una eklenebilir

app.Run();
