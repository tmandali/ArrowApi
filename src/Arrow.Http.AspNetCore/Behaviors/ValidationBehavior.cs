//using Arrow.Http.AspNetCore.Dispatcher;
//using System.ComponentModel.DataAnnotations;

//namespace Arrow.Http.AspNetCore.Behaviors;

//public sealed class ValidationBehavior<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
//    : IPipelineBehavior<TRequest, TResponse>
//    where TRequest : IRequest<TResponse>
//{
//    public async ValueTask<TResponse> Handle(
//        TRequest request,
//        RequestHandlerDelegate<TResponse> next,
//        CancellationToken cancellationToken)
//    {
//        if (!validators.Any())
//        {
//            return await next();
//        }

//        var context = new ValidationContext<TRequest>(request);
//        var failures = new List<FluentValidation.Results.ValidationFailure>();

//        foreach (var validator in validators)
//        {
//            var result = await validator.ValidateAsync(context, cancellationToken);
//            if (!result.IsValid)
//            {
//                failures.AddRange(result.Errors);
//            }
//        }

//        if (failures.Count > 0)
//        {
//            throw new ValidationException(failures);
//        }

//        return await next();
//    }
//}