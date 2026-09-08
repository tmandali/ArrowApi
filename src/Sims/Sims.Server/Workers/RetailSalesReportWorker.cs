using Apache.Arrow;
using Arrow.Data;
using Arrow.Http.AspNetCore.Dispatcher;
using Arrow.Jobs;
using Dapper;
using FluentValidation;
using Microsoft.Data.SqlClient;
using System.Runtime.CompilerServices;

namespace Sims.Server.Workers;

public sealed record RetailSalesReportParams(DateTime BasTarih, DateTime BitTarih, string SirketKod) : IRequest<IAsyncEnumerable<RecordBatch>>;

public sealed class RetailSalesReportWorker(
    //ILogger<RetailSalesReportWorker> logger,
    IArrowJobExecutionContext context,
    IConfiguration configuration) : IArrowJobWorker<RetailSalesReportParams>
{
    public async IAsyncEnumerable<RecordBatch> Handle(
        RetailSalesReportParams request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var cnnString = configuration.GetConnectionString("retail");
        await using SqlConnection cnn = new(cnnString);
        await context.PublishInfoAsync("Satış Raporu Başladı", cancellationToken);
        await cnn.OpenAsync(cancellationToken);
        await context.PublishInfoAsync("Sunucuya bağlandı", cancellationToken);

        var command = new CommandDefinition(
            // Para kolonları decimal(16,2): istemci Arrow Decimal128'i scale ile
            // number'a çevirir (utils/arrow-decimal). Float zorunlu değil.
            commandText: "select k.Depo, k.SatisID, b.Islem, b.MusteriNo, cast(b.HareketBaslamaTarih as Date) Tarih,\r\n" +
                         "cast(d.Miktar*i.Etki*-1 as decimal(16,2)) Miktar,\r\n" +
                         "cast((ToplamTutar-GenelIskontoTutar)*i.Etki*-1 as decimal(16,2)) Tutar,\r\n" +
                         "cast(b.ToplamKDVTutar*i.Etki*-1 as decimal(16,2)) Kdv,\r\n" +
                         "b.ParaBirimi\r\nfrom (\r\n" +
                         "select Depo, SatisID from tb_SatisBaslik (nolock)\r\n" +
                         "where HareketBaslamaTarih >= @BasTarih and HareketBaslamaTarih < @BitTarih\r\n" +
                         "and exists (select 1 from tb_Depo (nolock) where Kod=tb_SatisBaslik.Depo and AXSirketKodu=@SirketKod)) k\r\n" +
                         "left join tb_SatisBaslik b (nolock) on b.Depo = k.Depo and b.SatisID=k.SatisID\r\n" +
                         "left join vw_Islem i (nolock) on i.Kod=b.Islem\r\n" +
                         "cross apply (select sum(Miktar) Miktar from tb_SatisDetay d (nolock) where d.Depo = k.Depo and d.SatisID=k.SatisID) d",
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
        RuleFor(x => x.SirketKod).NotEmpty().WithMessage("Şirket kodu boş olamaz.");
    }
}