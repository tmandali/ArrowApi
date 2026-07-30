using System.Diagnostics;

namespace Arrow.Jobs;

/// <summary>HTTP create activity ↔ job execute activity bağlama.</summary>
public static class ArrowJobTracePropagation
{
    /// <summary>Mevcut izleme ortamını (TraceId, SpanId, TraceFlags) job modeline kaydeder.</summary>
    public static void CaptureCurrent<TRequest>(ArrowJob<TRequest> job)
        where TRequest : notnull
    {
        ThrowHelper.ThrowIfNull(job);

        Activity? activity = Activity.Current;
        if (activity is null)
            return;

        job.TraceId = activity.TraceId.ToHexString();
        job.ParentSpanId = activity.SpanId.ToHexString();
        job.TraceFlags = (byte)activity.ActivityTraceFlags;
    }

    /// <summary>Job yürütme aşaması için yeni bir OpenTelemetry etkinliği (<c>ArrowJob.Execute</c>) başlatır.</summary>
    public static Activity? StartExecuteActivity<TRequest>(ArrowJob<TRequest> job)
        where TRequest : notnull
    {
        ThrowHelper.ThrowIfNull(job);

        Activity? activity;
        if (TryCreateParentContext(job, out ActivityContext parent))
        {
            activity = ArrowJobActivity.Source.StartActivity(
                "ArrowJob.Execute",
                ActivityKind.Internal,
                parent);
        }
        else
        {
            activity = ArrowJobActivity.Source.StartActivity("ArrowJob.Execute");
        }

        activity?.SetTag("arrow.job.id", job.Id.ToString("D"));
        activity?.SetTag("arrow.job.request_type", typeof(TRequest).FullName);
        return activity;
    }

    private static bool TryCreateParentContext<TRequest>(ArrowJob<TRequest> job, out ActivityContext parent)
        where TRequest : notnull
    {
        parent = default;
        if (string.IsNullOrEmpty(job.TraceId) || string.IsNullOrEmpty(job.ParentSpanId))
            return false;

        try
        {
            ActivityTraceId traceId = ActivityTraceId.CreateFromString(job.TraceId.AsSpan());
            ActivitySpanId spanId = ActivitySpanId.CreateFromString(job.ParentSpanId.AsSpan());
            ActivityTraceFlags flags = job.TraceFlags is { } f
                ? (ActivityTraceFlags)f
                : ActivityTraceFlags.Recorded;
            parent = new ActivityContext(traceId, spanId, flags, traceState: null, isRemote: true);
            return true;
        }
        catch (ArgumentOutOfRangeException)
        {
            return false;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
