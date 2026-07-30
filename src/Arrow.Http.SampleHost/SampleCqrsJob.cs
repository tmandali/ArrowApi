using Arrow.Http.AspNetCore.Dispatcher;
using Arrow.Jobs;
using FluentValidation;
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

public sealed class CreateProductCqrsCommandValidator : FluentValidation.AbstractValidator<CreateProductCqrsCommand>
{
    public CreateProductCqrsCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Ürün adı boş olamaz.");
        RuleFor(x => x.Price).GreaterThan(0).WithMessage("Fiyat 0'dan büyük olmalıdır.");
    }
}
