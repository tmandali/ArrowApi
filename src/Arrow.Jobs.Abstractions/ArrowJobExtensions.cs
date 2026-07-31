namespace Arrow.Jobs;

/// <summary>
/// Arrow Job istekleri ve kontrat isimleri için DX kolaylaştırıcı extension metodlar.
/// </summary>
public static class ArrowJobExtensions
{
    /// <summary>
    /// Job / Kontrat adının hedef isimle (büyük/küçük harf duyarsız) eşleşip eşleşmediğini kontrol eder.
    /// </summary>
    /// <param name="jobName">Mevcut istek veya job adı.</param>
    /// <param name="targetJobName">Karşılaştırılacak hedef job adı.</param>
    /// <returns>Eşleşirse <see langword="true"/>, aksi halde <see langword="false"/>.</returns>
    public static bool IsJob(this string? jobName, string targetJobName)
    {
        if (string.IsNullOrWhiteSpace(jobName) || string.IsNullOrWhiteSpace(targetJobName))
            return false;

        return string.Equals(jobName, targetJobName, StringComparison.OrdinalIgnoreCase);
    }
}
