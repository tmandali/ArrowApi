namespace Arrow.Http.AspNetCore.Dispatcher;
/// <summary>
/// Marker for an in-process notification. Multiple handlers per notification are allowed.
/// In-process only - see the multi-instance section of the article for the ceiling.
/// </summary>
public interface INotification;

public interface INotificationHandler<in TNotification>
    where TNotification : INotification
{
    ValueTask Handle(TNotification notification, CancellationToken cancellationToken);
}

public interface IPublisher
{
    ValueTask Publish<TNotification>(
        TNotification notification,
        CancellationToken cancellationToken = default)
        where TNotification : INotification;
}