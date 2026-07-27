namespace Arrow.Jobs;

public static class ArrowJobTypeResolver
{
    public static Type GetRequestType<TWorker>() =>
        TryGetRequestType(typeof(TWorker))
        ?? throw new InvalidOperationException(
            $"{typeof(TWorker).Name} must inherit ArrowJobWorker<TRequest>.");

    public static Type? TryGetRequestType(Type workerType)
    {
        for (Type? type = workerType; type is not null; type = type.BaseType)
        {
            foreach (Type iface in type.GetInterfaces())
            {
                if (iface.IsGenericType && iface.GetGenericTypeDefinition() == typeof(IArrowJobWorker<>))
                    return iface.GetGenericArguments()[0];
            }
        }

        return null;
    }
}
