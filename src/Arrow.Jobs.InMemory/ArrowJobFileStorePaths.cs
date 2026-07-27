namespace Arrow.Jobs.InMemory;

internal static class ArrowJobFileStorePaths
{
    public static string Resolve(Microsoft.Extensions.Hosting.IHostEnvironment environment, string directoryPath)
    {
        ArgumentNullException.ThrowIfNull(environment);
        ArgumentException.ThrowIfNullOrWhiteSpace(directoryPath);

        return Path.IsPathRooted(directoryPath)
            ? directoryPath
            : Path.Combine(environment.ContentRootPath, directoryPath);
    }
}
