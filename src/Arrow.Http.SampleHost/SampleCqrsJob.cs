using Arrow.Http.AspNetCore.Dispatcher;
using Arrow.Jobs;
using Microsoft.Extensions.Logging;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace Arrow.Http.SampleHost;

public sealed record CreateProductCqrsCommand(string Name, decimal Price, int Stock) : IRequest<Guid>;

public sealed class CreateProductCqrsCommandHandler : IArrowJobWorker<CreateProductCqrsCommand, Guid>
{
    private readonly ILogger<CreateProductCqrsCommandHandler> _logger;

    public CreateProductCqrsCommandHandler(ILogger<CreateProductCqrsCommandHandler> logger)
    {
        _logger = logger;
    }

    public ValueTask<Guid> Handle(CreateProductCqrsCommand request, CancellationToken cancellationToken)
    {
        _logger.LogInformation("CQRS Worker Handler çalıştı! Ürün: {Name}, Fiyat: {Price}, Stok: {Stock}", request.Name, request.Price, request.Stock);
        return ValueTask.FromResult(Guid.NewGuid());
    }
}
