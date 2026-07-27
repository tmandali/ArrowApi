using Arrow.Http.AspNetCore;
using Arrow.Http.SampleHost;
using Arrow.Jobs.InMemory;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddArrowResponse();
builder.Services.AddArrowJobs<DemoArrowJobWorker>();

var app = builder.Build();
app.UseArrowResponse();

app.MapArrowDemoEndpoints();

app.Run();
