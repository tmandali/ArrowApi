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

    public string GetResultPath(Guid jobId) => Path.Combine(_workDirectory, $"{jobId:N}.arrows");

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
                await writer.WriteEndAsync(cancellationToken);
        }
        finally
        {
            writer?.Dispose();
        }
    }

    public async IAsyncEnumerable<RecordBatch> ReadBatchesAsync(
        string resultPath,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(resultPath);

        FileStream stream = File.OpenRead(resultPath);
        await using ArrowBatchReader reader = ArrowData.OpenArrowReader(stream);
        await foreach (RecordBatch batch in reader.ReadBatchesAsync(cancellationToken))
            yield return batch;
    }

    public Task DeleteResultAsync(Guid jobId, CancellationToken cancellationToken = default)
    {
        string path = GetResultPath(jobId);
        if (File.Exists(path))
            File.Delete(path);

        return Task.CompletedTask;
    }
}
