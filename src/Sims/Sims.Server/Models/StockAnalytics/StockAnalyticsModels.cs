using System.Collections.Generic;
using Apache.Arrow;
using Arrow.Http.AspNetCore.Dispatcher;

namespace Sims.Server.Models.StockAnalytics;

/// <summary>Stock Analytics raporu sorgu parametreleri (Arrow job request).</summary>
public sealed class StockAnalyticsRequest : IRequest<IAsyncEnumerable<RecordBatch>>
{
    public DateOnly? FromDate { get; init; }
    public DateOnly? ToDate { get; init; }
    public string? FiscalYear { get; init; }
    public string? FinanceBook { get; init; }
    public string? Currency { get; init; }
    /// <summary><c>5-values</c> veya <c>all</c> — Arrow şemasındaki tutar kolonlarını belirler.</summary>
    public string? ValuesMode { get; init; }
    public bool ShowZeroValues { get; init; }
    public bool ShowGroupAccounts { get; init; } = true;
    public int? BatchSize { get; init; }
}

/// <summary>Hiyerarşik hesap satırı (örnek veri kaynağı).</summary>
public sealed record StockAnalyticsRowDto
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public decimal OpeningDr { get; init; }
    public decimal OpeningCr { get; init; }
    public decimal Debit { get; init; }
    public decimal Credit { get; init; }
    public decimal ClosingDr { get; init; }
    public decimal ClosingCr { get; init; }
    public IReadOnlyList<StockAnalyticsRowDto>? Children { get; init; }
}
