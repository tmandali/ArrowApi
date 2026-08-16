using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Arrow.Jobs.InMemory;

/// <summary>
/// Disk üzerindeki eski Arrow IPC sonuç dosyalarını (.arrows) periyodik olarak temizleyen arka plan servisi.
/// </summary>
public sealed class ArrowJobFileRetentionService : BackgroundService
{
    private readonly IHostEnvironment _environment;
    private readonly ILogger<ArrowJobFileRetentionService> _logger;
    private readonly string _directoryPath;
    private readonly TimeSpan _retention;
    private readonly TimeSpan _checkInterval;

    public ArrowJobFileRetentionService(
        IHostEnvironment environment,
        ILogger<ArrowJobFileRetentionService> logger,
        string directoryPath = ArrowJobsStorageExtensions.DefaultFileStorePath,
        TimeSpan? retention = null,
        TimeSpan? checkInterval = null)
    {
        _environment = environment ?? throw new ArgumentNullException(nameof(environment));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _directoryPath = directoryPath;
        _retention = retention ?? TimeSpan.FromHours(24);
        _checkInterval = checkInterval ?? TimeSpan.FromHours(1);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                CleanExpiredFiles();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Arrow IPC dosya saklama alanı temizlenirken hata oluştu.");
            }

            try
            {
                await Task.Delay(_checkInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private void CleanExpiredFiles()
    {
        string workDir = ArrowJobFileStorePaths.Resolve(_environment, _directoryPath);
        if (!Directory.Exists(workDir))
            return;

        DateTime cutoff = DateTime.UtcNow.Subtract(_retention);
        int deletedCount = 0;

        foreach (string file in Directory.EnumerateFiles(workDir, "*.arrows", SearchOption.AllDirectories))
        {
            try
            {
                var info = new FileInfo(file);
                if (info.LastWriteTimeUtc < cutoff)
                {
                    info.Delete();
                    deletedCount++;
                }
            }
            catch
            {
                // Dosya kilitli veya kullanımda ise yoksay
            }
        }

        if (deletedCount > 0)
        {
            _logger.LogInformation(
                "Arrow dosya temizliği tamamlandı: {Count} eski dosya silindi (Retention: {Retention})",
                deletedCount,
                _retention);
        }
    }
}
