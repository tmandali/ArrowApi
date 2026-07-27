using Arrow.Http.AspNetCore;
using System.Reflection;

namespace Arrow.Jobs.AspNetCore;

public static class ArrowJobEndpoints
{
    /// <summary>
    /// <typeparamref name="T"/> worker ise request worker'dan çıkarılır; aksi halde request tipidir.
    /// </summary>
    /// <param name="path">Job route prefix (ör. <c>/reports/jobs</c>). Zorunludur.</param>
    public static IEndpointRouteBuilder MapArrowJobEndpoints<T>(
        this IEndpointRouteBuilder endpoints,
        string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);

        Type type = typeof(T);
        Type requestType = ArrowJobTypeResolver.TryGetRequestType(type) ?? type;

        MethodInfo method = typeof(ArrowJobEndpoints)
            .GetMethod(nameof(MapArrowJobEndpointsCore), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(requestType);

        return (IEndpointRouteBuilder)method.Invoke(null, [endpoints, path])!;
    }

    private static IEndpointRouteBuilder MapArrowJobEndpointsCore<TRequest>(
        IEndpointRouteBuilder endpoints,
        string path)
        where TRequest : notnull
    {
        string jobsPath = NormalizePath(path);
        RouteGroupBuilder group = endpoints.MapGroup(jobsPath);

        group.MapPost(
                string.Empty,
                (TRequest request, HttpRequest httpRequest, IArrowJobStore<TRequest> store, IArrowJobQueue queue, CancellationToken cancellationToken) =>
                    CreateJobAsync(request, httpRequest, store, queue, cancellationToken))
            .Accepts<TRequest>("application/json");

        group.MapGet(
                "{id:guid}",
                (Guid id, HttpRequest request, IArrowJobStore<TRequest> store, IArrowJobResultStorage resultStorage, CancellationToken cancellationToken) =>
                    GetJob(id, request, store, resultStorage, cancellationToken))
            .ProducesArrow()
            .Produces<ArrowJobStatus>();

        group.MapGet(
            "{id:guid}/events",
            (Guid id, IArrowJobStore<TRequest> store, HttpResponse response, CancellationToken cancellationToken) =>
                StreamJobEvents(id, store, response, cancellationToken));

        return endpoints;
    }

    private static async Task<IResult> CreateJobAsync<TRequest>(
        TRequest request,
        HttpRequest httpRequest,
        IArrowJobStore<TRequest> store,
        IArrowJobQueue queue,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ArrowJob<TRequest> job = await store.CreateAsync(request, cancellationToken).ConfigureAwait(false);
        await queue.EnqueueAsync(job.Id, cancellationToken).ConfigureAwait(false);

        string jobsPath = ResolveJobsBasePath(httpRequest);
        string jobUrl = JobUrl(jobsPath, job.Id);
        return Results.Accepted(
            jobUrl,
            ToStatusResponse(job, jobsPath));
    }

    /// <summary>
    /// <c>Accept: application/json</c> → durum JSON.
    /// <c>Accept: application/vnd.apache.arrow.stream</c> → tamamlanınca Arrow IPC.
    /// </summary>
    private static async Task<IResult> GetJob<TRequest>(
        Guid id,
        HttpRequest request,
        IArrowJobStore<TRequest> store,
        IArrowJobResultStorage resultStorage,
        CancellationToken cancellationToken)
    {
        ArrowJob<TRequest>? job = await store.GetAsync(id, cancellationToken).ConfigureAwait(false);
        if (job is null)
            return Results.NotFound();

        string jobsPath = ResolveJobsBasePath(request);

        if (request.AcceptsArrowStream())
            return GetJobArrowResult(job, resultStorage, jobsPath, cancellationToken);

        return Results.Ok(ToStatusResponse(job, jobsPath));
    }

    private static Task StreamJobEvents<TRequest>(
        Guid id,
        IArrowJobStore<TRequest> store,
        HttpResponse response,
        CancellationToken cancellationToken) =>
        ArrowJobSse.StreamEventsAsync(
            id,
            store,
            response,
            ResolveJobsBasePath(response.HttpContext.Request),
            cancellationToken);

    private static IResult GetJobArrowResult<TRequest>(
        ArrowJob<TRequest> job,
        IArrowJobResultStorage resultStorage,
        string jobsPath,
        CancellationToken cancellationToken) =>
        job.State switch
        {
            ArrowJobState.Queued or ArrowJobState.Running => Results.Accepted(
              JobUrl(jobsPath, job.Id),
              ToStatusResponse(job, jobsPath)),
            ArrowJobState.Failed => Results.Problem(
              detail: job.Error,
              statusCode: StatusCodes.Status500InternalServerError,
              title: "Job başarısız"),
            ArrowJobState.Completed when string.IsNullOrEmpty(job.ResultPath) => Results.Problem(
              detail: "Sonuç dosyası bulunamadı.",
              statusCode: StatusCodes.Status500InternalServerError),
            ArrowJobState.Completed => ArrowResults.FromBatches(
              resultStorage.ReadBatchesAsync(job.ResultPath!, cancellationToken)),
            _ => Results.StatusCode(StatusCodes.Status500InternalServerError)
        };

    private static ArrowJobStatus ToStatusResponse<TRequest>(ArrowJob<TRequest> job, string jobsPath) =>
        new(
            job.Id,
            job.State.ToString(),
            JobUrl(jobsPath, job.Id),
            EventsUrl(jobsPath, job.Id),
            job.CreatedAt,
            job.CompletedAt,
            job.Error);

    private static string JobUrl(string jobsPath, Guid id) => $"{jobsPath}/{id:D}";

    private static string EventsUrl(string jobsPath, Guid id) => $"{jobsPath}/{id:D}/events";

    private static string NormalizePath(string path)
    {
        path = path.Trim();
        if (!path.StartsWith('/'))
            path = "/" + path;

        return path.TrimEnd('/');
    }

    private static string ResolveJobsBasePath(HttpRequest request)
    {
        string? path = request.Path.Value;
        if (string.IsNullOrEmpty(path))
            return "/";

        path = path.TrimEnd('/');

        if (path.EndsWith("/events", StringComparison.OrdinalIgnoreCase))
            path = path[..^"/events".Length];

        int lastSlash = path.LastIndexOf('/');
        if (lastSlash >= 0 && Guid.TryParse(path.AsSpan(lastSlash + 1), out _))
            path = path[..lastSlash];

        return path;
    }
}
