using Sims.Server.Endpoints;
using Sims.Server.Services;
using Sims.Server.Workers;
using Microsoft.AspNetCore.Authentication;
using Arrow.Jobs;
using Arrow.Jobs.AspNetCore;
using Arrow.Jobs.InMemory;
using Arrow.Jobs.Postgres;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddArrowApi(arrow =>
{
    // Sonuçlar RAM'de tutulmaz; batch'ler diskteki Arrow IPC dosyasına stream edilir
    // (büyük raporlarda bellek sabit kalır). Global singleton kayıt: bir kez yeterlidir.
    //
    // Job kalıcılığı (store): `ArrowJobs:Postgres:ConnectionString` yapılandırması varsa
    // PostgresArrowJobStore kullanılır (dev'de yula.client'ta `npm run pglite-socket`
    // ile ayağa kaldırılmış yerel PGlite'a Npgsql üzerinden; pglite-socket açılışta
    // arrow_jobs şemasını otomatik uygular). Bağlantı dizesi yoksa InMemory store'a düşer.
    string? jobsPgConnectionString = builder.Configuration["ArrowJobs:Postgres:ConnectionString"];

    Action<IArrowJobsConfigurer> jobsStore = cfg => cfg.UseFileStore("arrow-jobs");
    if (!string.IsNullOrWhiteSpace(jobsPgConnectionString))
    {
        string pgConnectionString = jobsPgConnectionString;
        jobsStore = cfg =>
        {
            cfg.UsePostgres(pgConnectionString);
            cfg.UseFileStore("arrow-jobs");
        };
    }
    Console.WriteLine(string.IsNullOrWhiteSpace(jobsPgConnectionString)
        ? "[jobs] Store: InMemory (ArrowJobs:Postgres:ConnectionString tanımlı değil)"
        : "[jobs] Store: Postgres/PGlite -> " + jobsPgConnectionString.Split(';')[0]);

    arrow.AddJob<StockAnalyticsArrowJobWorker>("stock-analytics", jobsStore);
    arrow.AddJob<StockBalanceArrowJobWorker>("stock-balance", jobsStore);
    arrow.AddJob<RetailSalesReportWorker>("retail-sales-report", jobsStore);
});

// ── Login kullanıcı → OIDC (Keycloak) JWT doğrulama ────────────────────────────
// yula.client, session'daki Keycloak access token'ını `Authorization: Bearer`
// ile gönderir (bkz. yula.client lib/company-headers.ts + auth-headers.ts).
// Issuer yapılandırılırsa: token JWKS ile doğrulanır, sub/email/roles claim'leri
// her istekte ClaimsPrincipal'da hazır (gelecek kullanıcı bazlı job scoping köprüsü).
// Issuer boşsa YOKTU — yapılandırma yok → kimlik doğrulama kapalı, tek kullanıcı
// modu değişmez. Endpoint'ler ayrıca `.RequireAuthorization()` taşımadığı için
// token'ı olmayan/geçersiz istekler anonymous olarak geçmeye devam eder
// (fallback korunur: Tauri desktop / provider'sız mod kırılmaz).
var keycloakIssuer = builder.Configuration["Auth:KeycloakIssuer"];
var keycloakAudience = builder.Configuration["Auth:KeycloakAudience"];
var keycloakAuthEnabled = !string.IsNullOrWhiteSpace(keycloakIssuer);
if (keycloakAuthEnabled)
{
    builder.Services.AddAuthentication()
        .AddJwtBearer(options =>
        {
            // Keycloak realm issuer'ı; JWKS discovery: {issuer}/.well-known/openid-configuration
            options.Authority = keycloakIssuer;
            if (!string.IsNullOrWhiteSpace(keycloakAudience))
            {
                options.TokenValidationParameters.ValidAudience = keycloakAudience;
            }
            // .NET 10+: authority HTTP ise metadata discovery startup'ta fırlatır
            // ("MetadataAddress or Authority must use HTTPS unless disabled for
            // development by setting RequireHttpsMetadata=false"). Yerel Keycloak
            // (Development, http://localhost:8080) için HTTPS şartını yalnızca
            // dev ortamında gevşetiriz; üretim issuer'ı https olduğundan
            // RequireHttpsMetadata varsayılan (true) kalır.
            if (keycloakIssuer is string issuer &&
                !issuer.StartsWith("https", StringComparison.OrdinalIgnoreCase) &&
                builder.Environment.IsDevelopment())
            {
                options.RequireHttpsMetadata = false;
            }
        });
}
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

if (keycloakAuthEnabled)
{
    app.UseAuthentication();
}

app.UseCors();
app.UseExceptionHandler();
app.UseStatusCodePages();

app.UseDefaultFiles();
app.MapStaticAssets();

app.UseArrowApi("/api/arrow/jobs", jobs =>
{
    // Her Çalıştır yeni GUID üretir; tamamlanmış iş 409 ile yeniden açılmaz.
    jobs.MapJob("stock-analytics");
    jobs.MapJob("stock-balance");
    jobs.MapJob("retail-sales-report");
});

// OIDC köprüsü testi (GET /api/arrow/whoami): login kullanıcıyı doğrulayıp
// claim'leri echo eder. Kimliksiz istek → authenticated:false (fallback kanıtı).
app.MapGet("/api/arrow/whoami", (System.Security.Claims.ClaimsPrincipal user) => Results.Ok(new
{
    authenticated = user.Identity?.IsAuthenticated ?? false,
    sub = user.FindFirst("sub")?.Value ?? user.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
    email = user.FindFirst("email")?.Value,
}));

app.MapStockAnalyticsEndpoints();

app.MapFallbackToFile("/index.html");

app.Run();
