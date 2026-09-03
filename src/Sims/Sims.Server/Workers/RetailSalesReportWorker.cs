using Apache.Arrow;
using Arrow.Data;
using Arrow.Http.AspNetCore.Dispatcher;
using Arrow.Jobs;
using Dapper;
using FluentValidation;
using Microsoft.Data.SqlClient;
using System.Runtime.CompilerServices;

namespace Sims.Server.Workers;

public sealed record RetailSalesReportParams(DateTime BasTarih, DateTime BitTarih) : IRequest<IAsyncEnumerable<RecordBatch>>;

public sealed class RetailSalesReportWorker(
    //ILogger<RetailSalesReportWorker> logger,
    IConfiguration configuration) : IArrowJobWorker<RetailSalesReportParams>
{
    public async IAsyncEnumerable<RecordBatch> Handle(
        RetailSalesReportParams request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var cnnString = configuration.GetConnectionString("retail");
        await using SqlConnection cnn = new(cnnString);
        await cnn.OpenAsync(cancellationToken);

        var command = new CommandDefinition(
            commandText: "SELECT Depo, SatisID, KasaTip, HareketBaslamaTarih, HareketBitisTarih, BelgeNo, Statu, ToplamTutar, ToplamKdvTutar, GenelIskontoTutar, Islem, SonDuzenleme, KasaID, ParaBirimi, Kasiyer, MusteriNo\n" +
                         "FROM tb_SatisBaslik (nolock)\n" +
                         "WHERE HareketBaslamaTarih >= @BasTarih AND HareketBaslamaTarih < @BitTarih",
            parameters: request,
            cancellationToken: cancellationToken
        );

        await using var reader = await cnn.ExecuteReaderAsync(command);
        await using var arrowReader = reader.OpenArrowReader(new ArrowConversionOptions { BatchSize = 10_000 });

        await foreach (RecordBatch batch in arrowReader.WithCancellation(cancellationToken))
        {
            yield return batch;         
        }
    }
}

public sealed class RetailSalesReportParamsValidator : AbstractValidator<RetailSalesReportParams>
{
    public RetailSalesReportParamsValidator()
    {
        RuleFor(x => x.BasTarih).NotEmpty().WithMessage("Başlangıç tarihi boş olamaz.");
        RuleFor(x => x.BitTarih).GreaterThan(x => x.BasTarih).WithMessage("Bitiş tarihi başlangıç tarihinden büyük olmalıdır.");
    }
}