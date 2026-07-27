namespace Arrow.Http.AspNetCore;

/// <summary><see cref="ArrowDataTableSource"/> dönüşlerini <see cref="IResult"/>'a çevirir.</summary>
internal sealed class ArrowResponseEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        object? result = await next(context).ConfigureAwait(false);

        if (result is ArrowDataTableSource source)
        {
            return ArrowResults.FromDataTable(source.Table, source.Options);
        }

        return result;
    }
}
