using Arrow.Http.AspNetCore;
using Microsoft.Extensions.DependencyInjection;
using System.Reflection;

namespace Arrow.Jobs.AspNetCore;

public static class ArrowJobEndpoints
{
    private static readonly string[] JobActionSuffixes =
    [
        "/events",
        "/request",
        "/cancel",
        "/retry"
    ];

    /// <summary>
    /// <c>AddArrowJob&lt;T&gt;(path)</c> ile kaydedilen job endpoint'lerini map eder.
    /// </summary>
    internal static WebApplication MapArrowJob(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        foreach (ArrowJobEndpointRegistration registration in
                 app.Services.GetServices<ArrowJobEndpointRegistration>())
        {
            MapRegistered(app, registration);
        }

        return app;
    }

    /// <summary>
    /// <typeparamref name="T"/> worker ise request worker'dan çıkarılır; aksi halde request tipidir.
    /// </summary>
    internal static IEndpointRouteBuilder MapArrowJobEndpoints<T>(
        this IEndpointRouteBuilder endpoints,
        string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        return MapRegistered(endpoints, new ArrowJobEndpointRegistration(typeof(T), path));
    }

    internal static IEndpointRouteBuilder MapRegistered(
        IEndpointRouteBuilder endpoints,
        ArrowJobEndpointRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        ArgumentNullException.ThrowIfNull(registration);

        Type requestType = ArrowJobTypeResolver.TryGetRequestType(registration.ServiceType)
            ?? registration.ServiceType;

        MethodInfo method = typeof(ArrowJobEndpoints)
            .GetMethod(nameof(MapArrowJobEndpointsCore), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(requestType);

        return (IEndpointRouteBuilder)method.Invoke(null, [endpoints, registration.Path])!;
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
                (TRequest request, HttpRequest httpRequest, IArrowJobStore<TRequest> store, IArrowJobQueue<TRequest> queue, CancellationToken cancellationToken) =>
                    CreateJobAsync(request, httpRequest, store, queue, cancellationToken))
            .Accepts<TRequest>("application/json");

        group.MapGet(
                string.Empty,
                (HttpRequest httpRequest, IArrowJobStore<TRequest> store, [FromQuery] string? state, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] int? skip, [FromQuery] int? take, CancellationToken cancellationToken) =>
                    ListJobsAsync(httpRequest, store, state, from, to, skip, take, cancellationToken))
            .Produces<ArrowJobStatusList>();

        group.MapGet(
                "{id:guid}",
                (Guid id, HttpRequest request, IArrowJobStore<TRequest> store, CancellationToken cancellationToken) =>
                    GetJob(id, request, store, cancellationToken))
            .ProducesArrow()
            .Produces<ArrowJobStatus>();

        group.MapGet(
                "{id:guid}/request",
                (Guid id, IArrowJobStore<TRequest> store, CancellationToken cancellationToken) =>
                    GetJobRequestAsync(id, store, cancellationToken))
            .Produces<TRequest>();

        group.MapGet(
            "{id:guid}/events",
            (Guid id, IArrowJobStore<TRequest> store, IArrowJobEventHub eventHub, HttpResponse response, CancellationToken cancellationToken) =>
                StreamJobEvents(id, store, eventHub, response, cancellationToken));

        group.MapPost(
                "{id:guid}/cancel",
                (Guid id, HttpRequest httpRequest, IArrowJobStore<TRequest> store, IArrowJobEventHub eventHub, CancellationToken cancellationToken) =>
                    CancelJobAsync(id, httpRequest, store, eventHub, cancellationToken))
            .Produces<ArrowJobStatus>();

        group.MapPost(
                "{id:guid}/retry",
                (Guid id, HttpRequest httpRequest, IArrowJobStore<TRequest> store, IArrowJobQueue<TRequest> queue, CancellationToken cancellationToken) =>
                    RetryJobAsync(id, httpRequest, store, queue, cancellationToken))
            .Produces<ArrowJobStatus>();

        group.MapDelete(
                "{id:guid}",
                (Guid id, IArrowJobStore<TRequest> store, IArrowJobResultStorage resultStorage, CancellationToken cancellationToken) =>
                    DeleteJobAsync(id, store, resultStorage, cancellationToken));

        return endpoints;
    }

    private static async Task<IResult> CreateJobAsync<TRequest>(
        TRequest request,
        HttpRequest httpRequest,
        IArrowJobStore<TRequest> store,
        IArrowJobQueue<TRequest> queue,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ArrowJob<TRequest> job = await store.CreateAsync(request, cancellationToken);
        await queue.EnqueueAsync(job.Id, cancellationToken);

        string jobsPath = ResolveJobsBasePath(httpRequest);
        string jobUrl = JobUrl(jobsPath, job.Id);
        return Results.Accepted(
            jobUrl,
            ToStatusResponse(job, jobsPath));
    }

    private static async Task<IResult> ListJobsAsync<TRequest>(
        HttpRequest httpRequest,
        IArrowJobStore<TRequest> store,
        string? state,
        DateTimeOffset? from,
        DateTimeOffset? to,
        int? skip,
        int? take,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ArrowJobState? parsedState = null;
        if (!string.IsNullOrWhiteSpace(state))
        {
            if (!Enum.TryParse(state, ignoreCase: true, out ArrowJobState value))
                return Results.BadRequest($"Geçersiz state: {state}");

            parsedState = value;
        }

        var query = new ArrowJobListQuery(
            parsedState,
            from,
            to,
            skip ?? 0,
            take ?? 50);

        ArrowJobListPage<TRequest> page = await store.ListAsync(query, cancellationToken);
        string jobsPath = ResolveJobsBasePath(httpRequest);
        ArrowJobStatusList response = new(
            page.Items.Select(j => ToStatusResponse(j, jobsPath)).ToList(),
            page.Total);

        return Results.Ok(response);
    }

    private static async Task<IResult> GetJobRequestAsync<TRequest>(
        Guid id,
        IArrowJobStore<TRequest> store,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ArrowJob<TRequest>? job = await store.GetAsync(id, cancellationToken);
        return job is null ? Results.NotFound() : Results.Ok(job.Request);
    }

    private static async Task<IResult> CancelJobAsync<TRequest>(
        Guid id,
        HttpRequest httpRequest,
        IArrowJobStore<TRequest> store,
        IArrowJobEventHub eventHub,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ArrowJob<TRequest>? job = await store.GetAsync(id, cancellationToken);
        if (job is null)
            return Results.NotFound();

        if (job.State is not (ArrowJobState.Queued or ArrowJobState.Running))
            return Results.Conflict(ToStatusResponse(job, ResolveJobsBasePath(httpRequest)));

        if (!await store.TryCancelAsync(id, cancellationToken))
        {
            job = await store.GetAsync(id, cancellationToken);
            return job is null
                ? Results.NotFound()
                : Results.Conflict(ToStatusResponse(job, ResolveJobsBasePath(httpRequest)));
        }

        job = await store.GetAsync(id, cancellationToken);
        if (job is null)
            return Results.NotFound();

        string jobsPath = ResolveJobsBasePath(httpRequest);
        ArrowJobStatus status = ToStatusResponse(job, jobsPath);
        await eventHub.PublishAsync(
            id,
            ArrowJobEventNames.Cancelled,
            new ArrowJobEvent(
                job.Id,
                job.State.ToString(),
                job.CreatedAt,
                job.CompletedAt,
                job.Error,
                status.JobUrl,
                status.EventsUrl,
                job.BatchCount,
                job.TotalRows,
                TraceId: job.TraceId),
            cancellationToken);

        return Results.Ok(status);
    }

    private static async Task<IResult> RetryJobAsync<TRequest>(
        Guid id,
        HttpRequest httpRequest,
        IArrowJobStore<TRequest> store,
        IArrowJobQueue<TRequest> queue,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ArrowJob<TRequest>? job = await store.GetAsync(id, cancellationToken);
        if (job is null)
            return Results.NotFound();

        if (job.State is not (ArrowJobState.Failed or ArrowJobState.Cancelled))
            return Results.Conflict(ToStatusResponse(job, ResolveJobsBasePath(httpRequest)));

        ArrowJob<TRequest> retry = await store.CreateAsync(job.Request, cancellationToken);
        await queue.EnqueueAsync(retry.Id, cancellationToken);

        string jobsPath = ResolveJobsBasePath(httpRequest);
        string jobUrl = JobUrl(jobsPath, retry.Id);
        return Results.Accepted(
            jobUrl,
            ToStatusResponse(retry, jobsPath, retriedFrom: id));
    }

    private static async Task<IResult> DeleteJobAsync<TRequest>(
        Guid id,
        IArrowJobStore<TRequest> store,
        IArrowJobResultStorage resultStorage,
        CancellationToken cancellationToken)
        where TRequest : notnull
    {
        ArrowJob<TRequest>? job = await store.GetAsync(id, cancellationToken);
        if (job is null)
            return Results.NotFound();

        if (job.State == ArrowJobState.Running)
            return Results.Conflict();

        if (!await store.TryDeleteAsync(id, cancellationToken))
            return Results.Conflict();

        await resultStorage.DeleteResultAsync(id, cancellationToken);
        return Results.NoContent();
    }

    /// <summary>
    /// <c>Accept: application/json</c> → durum JSON.
    /// <c>Accept: application/vnd.apache.arrow.stream</c> → tamamlanınca Arrow IPC.
    /// </summary>
    private static async Task<IResult> GetJob<TRequest>(
        Guid id,
        HttpRequest request,
        IArrowJobStore<TRequest> store,
        CancellationToken cancellationToken)
    {
        ArrowJob<TRequest>? job = await store.GetAsync(id, cancellationToken);
        if (job is null)
            return Results.NotFound();

        string jobsPath = ResolveJobsBasePath(request);

        if (request.AcceptsArrowStream())
        {
            IArrowJobResultStorage? resultStorage = request.HttpContext.RequestServices
                .GetService<IArrowJobResultStorage>();
            return GetJobArrowResult(job, resultStorage, jobsPath, cancellationToken);
        }

        return Results.Ok(ToStatusResponse(job, jobsPath));
    }

    private static Task StreamJobEvents<TRequest>(
        Guid id,
        IArrowJobStore<TRequest> store,
        IArrowJobEventHub eventHub,
        HttpResponse response,
        CancellationToken cancellationToken) =>
        ArrowJobSse.StreamEventsAsync(
            id,
            store,
            eventHub,
            response,
            ResolveJobsBasePath(response.HttpContext.Request),
            cancellationToken);

    private static IResult GetJobArrowResult<TRequest>(
        ArrowJob<TRequest> job,
        IArrowJobResultStorage? resultStorage,
        string jobsPath,
        CancellationToken cancellationToken) =>
        job.State switch
        {
            ArrowJobState.Queued or ArrowJobState.Running => Results.Accepted(
              JobUrl(jobsPath, job.Id),
              ToStatusResponse(job, jobsPath)),
            ArrowJobState.Cancelled => Results.Problem(
              detail: "Job iptal edildi.",
              statusCode: StatusCodes.Status409Conflict,
              title: "Job iptal"),
            ArrowJobState.Failed => Results.Problem(
              detail: job.Error,
              statusCode: StatusCodes.Status500InternalServerError,
              title: "Job başarısız"),
            ArrowJobState.Completed when resultStorage is null => Results.Problem(
              detail: "Sonuç deposu yapılandırılmamış.",
              statusCode: StatusCodes.Status500InternalServerError),
            ArrowJobState.Completed when string.IsNullOrEmpty(job.ResultPath) || !File.Exists(job.ResultPath) => Results.Problem(
              detail: "Sonuç dosyası bulunamadı.",
              statusCode: StatusCodes.Status500InternalServerError),
            ArrowJobState.Completed => ArrowResults.FromBatches(
              resultStorage.ReadBatchesAsync(job.ResultPath, cancellationToken)),
            _ => Results.StatusCode(StatusCodes.Status500InternalServerError)
        };

    private static ArrowJobStatus ToStatusResponse<TRequest>(
        ArrowJob<TRequest> job,
        string jobsPath,
        Guid? retriedFrom = null) =>
        new(
            job.Id,
            job.State.ToString(),
            JobUrl(jobsPath, job.Id),
            EventsUrl(jobsPath, job.Id),
            job.CreatedAt,
            job.CompletedAt,
            job.Error,
            job.BatchCount,
            job.TotalRows,
            retriedFrom);

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

        foreach (string suffix in JobActionSuffixes)
        {
            if (path.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
            {
                path = path[..^suffix.Length];
                break;
            }
        }

        int lastSlash = path.LastIndexOf('/');
        if (lastSlash >= 0 && Guid.TryParse(path.AsSpan(lastSlash + 1), out _))
            path = path[..lastSlash];

        return path;
    }
}
