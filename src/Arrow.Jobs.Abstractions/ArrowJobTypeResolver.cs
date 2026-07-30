namespace Arrow.Jobs;

public static class ArrowJobTypeResolver
{
    public static Type GetRequestType<TWorker>() =>
        TryGetRequestType(typeof(TWorker))
        ?? throw new InvalidOperationException(
            $"{typeof(TWorker).Name} must implement IArrowJobWorker<TRequest> or IRequestHandler<TRequest, TResponse>.");

    public static Type? TryGetRequestType(Type workerType)
    {
        for (Type? type = workerType; type is not null; type = type.BaseType)
        {
            foreach (Type iface in type.GetInterfaces())
            {
                if (iface.IsGenericType)
                {
                    Type gtd = iface.GetGenericTypeDefinition();
                    if (gtd == typeof(IArrowJobWorker<>) ||
                        gtd == typeof(IArrowJobWorker<,>) ||
                        gtd == typeof(Arrow.Http.AspNetCore.Dispatcher.IRequestHandler<,>))
                    {
                        return iface.GetGenericArguments()[0];
                    }
                }
            }
        }

        return null;
    }
}
