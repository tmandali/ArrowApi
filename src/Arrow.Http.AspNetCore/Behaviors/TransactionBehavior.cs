//using Arrow.Http.AspNetCore.Dispatcher;

//namespace Arrow.Http.AspNetCore.Behaviors;
///// <summary>
///// Marker for commands that require an EF Core transaction wrap.
///// </summary>
//public interface ITransactional;

//public sealed class TransactionBehavior<TRequest, TResponse>(
//    AppDbContext db,
//    ILogger<TransactionBehavior<TRequest, TResponse>> logger)
//    : IPipelineBehavior<TRequest, TResponse>
//    where TRequest : IRequest<TResponse>
//{
//    public async ValueTask<TResponse> Handle(
//        TRequest request,
//        RequestHandlerDelegate<TResponse> next,
//        CancellationToken cancellationToken)
//    {
//        if (request is not ITransactional)
//        {
//            return await next();
//        }

//        // The InMemory provider does not support real transactions - this is a no-op there.
//        // For SQL Server / Postgres / SQLite this opens, commits, or rolls back as expected.
//        if (!db.Database.IsInMemory())
//        {
//            await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
//            try
//            {
//                var response = await next();
//                await tx.CommitAsync(cancellationToken);
//                return response;
//            }
//            catch
//            {
//                logger.LogWarning("Rolling back transaction for {Request}", typeof(TRequest).Name);
//                await tx.RollbackAsync(cancellationToken);
//                throw;
//            }
//        }

//        return await next();
//    }
//}