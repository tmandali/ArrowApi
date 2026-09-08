using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sims.Server.Workers;

/// <summary>
/// Accepts ISO <c>YYYY-MM-DD</c> and compact <c>YYYYMMDD</c> (and optional time suffix).
/// </summary>
public sealed class FlexibleDateTimeJsonConverter : JsonConverter<DateTime>
{
    private static readonly string[] Formats =
    [
        "yyyy-MM-dd",
        "yyyyMMdd",
        "yyyy-MM-ddTHH:mm:ss",
        "yyyy-MM-ddTHH:mm:ss.FFFFFFF",
        "yyyy-MM-ddTHH:mm:ssK",
        "yyyy-MM-ddTHH:mm:ss.FFFFFFFK",
    ];

    public override DateTime Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
            return default;

        if (reader.TokenType == JsonTokenType.String)
        {
            var raw = reader.GetString()?.Trim();
            if (string.IsNullOrEmpty(raw))
                return default;

            if (DateTime.TryParseExact(
                    raw,
                    Formats,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var exact))
            {
                return exact;
            }

            if (DateTime.TryParse(
                    raw,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.RoundtripKind,
                    out var parsed))
            {
                return parsed;
            }

            throw new JsonException($"Invalid date value '{raw}'.");
        }

        if (reader.TokenType == JsonTokenType.Number && reader.TryGetInt64(out var epochMs))
        {
            // Rare: numeric epoch milliseconds
            return DateTimeOffset.FromUnixTimeMilliseconds(epochMs).UtcDateTime;
        }

        throw new JsonException($"Unexpected token {reader.TokenType} for DateTime.");
    }

    public override void Write(
        Utf8JsonWriter writer,
        DateTime value,
        JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
    }
}
