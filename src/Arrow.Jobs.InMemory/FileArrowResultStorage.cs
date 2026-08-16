using Apache.Arrow;
using Apache.Arrow.Ipc;
using Arrow.Data;
using System.Runtime.CompilerServices;

namespace Arrow.Jobs.InMemory;

public sealed class FileArrowResultStorage : IArrowJobResultStorage
{
    private readonly string _workDirectory;

    public FileArrowResultStorage(
        Microsoft.Extensions.Hosting.IHostEnvironment environment,
        string directoryPath = ArrowJobsStorageExtensions.DefaultFileStorePath)
    {
        ArgumentNullException.ThrowIfNull(environment);
        _workDirectory = ArrowJobFileStorePaths.Resolve(environment, directoryPath);
        Directory.CreateDirectory(_workDirectory);
    }

    public string GetResultPath(Guid jobId, string? name = null, Guid? rootJobId = null)
    {
        string dir = _workDirectory;
        if (rootJobId.HasValue)
        {
            dir = Path.Combine(_workDirectory, rootJobId.Value.ToString("N"));
        }

        Directory.CreateDirectory(dir);

        string fileName = string.IsNullOrWhiteSpace(name)
            ? $"{jobId:N}.arrows"
            : $"{SanitizeFileName(name)}_{jobId:N}.arrows";

        return Path.Combine(dir, fileName);
    }

    public async Task WriteBatchesAsync(
        string resultPath,
        IAsyncEnumerable<RecordBatch> batches,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(resultPath);
        ArgumentNullException.ThrowIfNull(batches);

        ArrowStreamWriter? writer = null;
        try
        {
            await foreach (RecordBatch batch in batches.WithCancellation(cancellationToken))
            {
                if (writer is null)
                {
                    FileStream file = new(
                        resultPath,
                        FileMode.Create,
                        FileAccess.Write,
                        FileShare.None,
                        bufferSize: 4096,
                        FileOptions.Asynchronous);
                    writer = new ArrowStreamWriter(file, batch.Schema, leaveOpen: false);
                }

                await writer.WriteRecordBatchAsync(batch, cancellationToken);
            }

            if (writer is not null)
            {
                await writer.WriteEndAsync(cancellationToken);
            }
            else if (!File.Exists(resultPath))
            {
                File.Create(resultPath).Dispose();
            }
        }
        finally
        {
            writer?.Dispose();
        }
    }

    public Task<Result<ArrowBatchReader>> OpenBatchReaderAsync(
        string resultPath,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(resultPath) || !File.Exists(resultPath))
        {
            return Task.FromResult(Result<ArrowBatchReader>.NotFound($"Sonuç dosyası bulunamadı: '{resultPath}'"));
        }

        try
        {
            var fileInfo = new FileInfo(resultPath);
            if (fileInfo.Length == 0)
            {
                return Task.FromResult(Result<ArrowBatchReader>.Success(ArrowBatchReader.FromBatches([])));
            }

            FileStream stream = File.OpenRead(resultPath);
            ArrowBatchReader reader = ArrowData.OpenArrowReader(stream);
            return Task.FromResult(Result<ArrowBatchReader>.Success(reader));
        }
        catch (Exception ex)
        {
            return Task.FromResult(Result<ArrowBatchReader>.Failure($"Sonuç dosyası okunamadı: {ex.Message}", 500));
        }
    }

    public Task DeleteResultAsync(string? resultPath, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(resultPath) && File.Exists(resultPath))
        {
            File.Delete(resultPath);

            string? dir = Path.GetDirectoryName(resultPath);
            if (!string.IsNullOrEmpty(dir) &&
                !string.Equals(dir, _workDirectory, StringComparison.OrdinalIgnoreCase) &&
                Directory.Exists(dir) &&
                !Directory.EnumerateFileSystemEntries(dir).Any())
            {
                try
                {
                    Directory.Delete(dir);
                }
                catch
                {
                    // Suppress directory cleanup exception if folder locked
                }
            }
        }

        return Task.CompletedTask;
    }

    private static string SanitizeFileName(string name)
    {
        foreach (char c in Path.GetInvalidFileNameChars())
        {
            name = name.Replace(c, '_');
        }
        return name.Trim();
    }
}
