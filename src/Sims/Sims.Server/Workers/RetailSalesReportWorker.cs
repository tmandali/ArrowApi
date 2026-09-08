using Apache.Arrow;
using Arrow.Data;
using Arrow.Http.AspNetCore.Dispatcher;
using Arrow.Jobs;
using Dapper;
using FluentValidation;
using Microsoft.Data.SqlClient;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;

namespace Sims.Server.Workers;

/// <summary>
/// Wire JSON: <c>from_hareketTarihi</c> / <c>to_hareketTarihi</c> / <c>sirketKod</c>
/// (kriter <c>hareketTarihi</c> + <c>x-range-split</c>; bitiş hariç üst sınır).
/// Class + <see cref="JsonPropertyNameAttribute"/> — record positional parametrelerde
/// camelCase ile <c>from_*</c> anahtarları bağlanmayıp DateTime.MinValue kalıyordu.
/// </summary>
public sealed class RetailSalesReportParams : IRequest<IAsyncEnumerable<RecordBatch>>
{
    [JsonPropertyName("from_hareketTarihi")]
    [JsonConverter(typeof(FlexibleDateTimeJsonConverter))]
    public DateTime BasTarih { get; init; }

    [JsonPropertyName("to_hareketTarihi")]
    [JsonConverter(typeof(FlexibleDateTimeJsonConverter))]
    public DateTime BitTarih { get; init; }

    [JsonPropertyName("sirketKod")]
    public string SirketKod { get; init; } = "";
}

public sealed class RetailSalesReportWorker(
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
        RuleFor(x => x.BasTarih)
            .Must(d => d > DateTime.MinValue)
            .WithMessage("Başlangıç tarihi boş veya geçersiz (from_hareketTarihi).");
        RuleFor(x => x.BitTarih)
            .Must(d => d > DateTime.MinValue)
            .WithMessage("Bitiş tarihi boş veya geçersiz (to_hareketTarihi).");
        RuleFor(x => x.BitTarih)
            .GreaterThan(x => x.BasTarih)
            .WithMessage("Bitiş tarihi başlangıç tarihinden büyük olmalıdır.");
        RuleFor(x => x.SirketKod).NotEmpty().WithMessage("Şirket kodu boş olamaz.");
    }
}
