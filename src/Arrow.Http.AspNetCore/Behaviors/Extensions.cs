using Arrow.Http.AspNetCore.Dispatcher;
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;

namespace Arrow.Http.AspNetCore.Behaviors;


// Pipeline behaviors run in registration order: Logging wraps Validation wraps Caching wraps Transaction wraps the handler.
//builder.Services.AddPipelineBehavior(typeof(LoggingBehavior<,>));
//builder.Services.AddPipelineBehavior(typeof(ValidationBehavior<,>));
//builder.Services.AddPipelineBehavior(typeof(CachingBehavior<,>));
//builder.Services.AddPipelineBehavior(typeof(TransactionBehavior<,>));


//public sealed class CreateProductCommandValidator : AbstractValidator<CreateProductCommand>
//{
//    public CreateProductCommandValidator()
//    {
//        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
//        RuleFor(x => x.Price).GreaterThan(0);
//    }
//}

//public sealed class CreateProductCommandHandler(AppDbContext db)
//    : IRequestHandler<CreateProductCommand, Guid>
//{
//    public async ValueTask<Guid> Handle(CreateProductCommand request, CancellationToken cancellationToken)
//    {
//        var product = new Product
//        {
//            Id = Guid.NewGuid(),
//            Name = request.Name,
//            Price = request.Price,
//            CreatedAt = DateTime.UtcNow
//        };

//        db.Products.Add(product);
//        await db.SaveChangesAsync(cancellationToken);
//        return product.Id;
//    }
//}

//public sealed record ProductCreatedNotification(Guid ProductId, string Name) : INotification;

//public sealed class LogProductCreatedHandler(ILogger<LogProductCreatedHandler> logger)
//    : INotificationHandler<ProductCreatedNotification>
//{
//    public ValueTask Handle(ProductCreatedNotification notification, CancellationToken cancellationToken)
//    {
//        logger.LogInformation("Product created: {Id} - {Name}", notification.ProductId, notification.Name);
//        return ValueTask.CompletedTask;
//    }
//}

//public sealed record GetProductQuery(Guid Id) : IRequest<ProductDto?>, ICacheable
//{
//    public string CacheKey => $"product:{Id}";
//    public TimeSpan? Expiration => TimeSpan.FromMinutes(5);
//}

//public sealed record ProductDto(Guid Id, string Name, decimal Price, DateTime CreatedAt);

//public sealed class GetProductQueryHandler(AppDbContext db)
//    : IRequestHandler<GetProductQuery, ProductDto?>
//{
//    public async ValueTask<ProductDto?> Handle(GetProductQuery request, CancellationToken cancellationToken)
//    {
//        var product = await db.Products.FindAsync([request.Id], cancellationToken);
//        return product is null
//            ? null
//            : new ProductDto(product.Id, product.Name, product.Price, product.CreatedAt);
//    }
//}


// Endpoints - note ISender, not IMediator. Migration from MediatR is a using-statement swap.
//app.MapGet("/products/{id:guid}", async(Guid id, ISender sender, CancellationToken ct) =>
//{
//    var product = await sender.Send(new GetProductQuery(id), ct);
//    return product is not null ? Results.Ok(product) : Results.NotFound();
//});

//app.MapGet("/products", async (ISender sender, CancellationToken ct) =>
//{
//    var products = await sender.Send(new ListProductsQuery(), ct);
//    return Results.Ok(products);
//});

//app.MapPost("/products", async (
//    CreateProductCommand command, ISender sender, IPublisher publisher, CancellationToken ct) =>
//{
//    var id = await sender.Send(command, ct);
//    await publisher.Publish(new ProductCreatedNotification(id, command.Name), ct);
//    return Results.Created($"/products/{id}", new { id });
//});

//app.MapPut("/products/{id:guid}", async (
//    Guid id, UpdateProductCommand command, ISender sender, CancellationToken ct) =>
//{
//    if (id != command.Id) return Results.BadRequest();
//    var ok = await sender.Send(command, ct);
//    return ok ? Results.NoContent() : Results.NotFound();
//});

//app.MapDelete("/products/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
//{
//    var ok = await sender.Send(new DeleteProductCommand(id), ct);
//    return ok ? Results.NoContent() : Results.NotFound();
//});