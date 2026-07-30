using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Arrow.Jobs;

/// <summary>Job isteği için SHA256 tekilleştirme hash'i hesaplar.</summary>
public static class ArrowJobRequestHasher
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    /// <summary>İstek DTO nesnesini JSON serileştirip SHA256 hash string'i hesaplar.</summary>
    /// <typeparam name="TRequest">İstek DTO türü.</typeparam>
    /// <param name="request">İstek nesnesi.</param>
    /// <returns>Hex formatında SHA256 hash string'i.</returns>
    public static string ComputeHash<TRequest>(TRequest request)
    {
        if (request is null)
            return string.Empty;

        string json = JsonSerializer.Serialize(request, Options);
        byte[] bytes = Encoding.UTF8.GetBytes(json);
        using var sha256 = SHA256.Create();
        byte[] hash = sha256.ComputeHash(bytes);
        StringBuilder sb = new(hash.Length * 2);
        foreach (byte b in hash)
            sb.Append(b.ToString("X2"));

        return sb.ToString();
    }
}
