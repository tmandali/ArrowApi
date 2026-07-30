namespace Arrow.Jobs;

/// <summary>Worker sınıflarından istek DTO türlerini çözen yardımcı sınıf.</summary>
public static class ArrowJobTypeResolver
{
    /// <summary>Worker türünün işlediği istek DTO türünü çözer veya istisna fırlatır.</summary>
    public static Type GetRequestType<TWorker>() =>
        TryGetRequestType(typeof(TWorker))
        ?? throw new InvalidOperationException(
            $"{typeof(TWorker).Name} must implement IArrowJobWorker<TRequest> or IRequestHandler<TRequest, TResponse>.");

    /// <summary>Worker türünün işlediği istek DTO türünü çözer.</summary>
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
