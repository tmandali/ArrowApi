namespace Arrow.Jobs.AspNetCore.Authentication;

//public sealed class ApiKeyValidator(
//    AppDbContext db,
//    HybridCache cache,
//    TimeProvider time,
//    ILogger<ApiKeyValidator> logger) : IApiKeyValidator
//{
//    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(2);

//    public async Task<ApiKeyValidationResult> ValidateAsync(
//        string plaintextKey, CancellationToken ct)
//    {
//        if (string.IsNullOrWhiteSpace(plaintextKey))
//            return ApiKeyValidationResult.Invalid("API key is empty.");

//        var prefix = plaintextKey.Length >= 12 ? plaintextKey[..12] : plaintextKey;
//        var hash = ApiKeyHasher.Hash(plaintextKey);

//        var cached = await cache.GetOrCreateAsync(
//            $"apikey:{hash}",
//            async cancel => await LookupAsync(hash, cancel),
//            new HybridCacheEntryOptions { Expiration = CacheTtl },
//            cancellationToken: ct);

//        if (cached is null)
//            return ApiKeyValidationResult.Invalid("API key not found.", prefix);

//        if (cached.RevokedAt is not null)
//            return ApiKeyValidationResult.Invalid("API key has been revoked.", prefix);

//        if (cached.ExpiresAt is { } exp && exp <= time.GetUtcNow())
//            return ApiKeyValidationResult.Invalid("API key has expired.", prefix);

//        _ = TouchLastUsedAsync(cached.Id);

//        var scopes = string.IsNullOrEmpty(cached.Scopes)
//            ? Array.Empty<string>()
//            : cached.Scopes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

//        return new ApiKeyValidationResult(
//            true, null, cached.Id, cached.Name, cached.OwnerId, cached.Prefix, scopes);
//    }

//    private async Task<ApiKey?> LookupAsync(string hash, CancellationToken ct)
//        => await db.ApiKeys.AsNoTracking()
//            .FirstOrDefaultAsync(k => k.KeyHash == hash, ct);

//    private async Task TouchLastUsedAsync(Guid keyId)
//    {
//        try
//        {
//            await db.ApiKeys
//                .Where(k => k.Id == keyId)
//                .ExecuteUpdateAsync(s =>
//                    s.SetProperty(k => k.LastUsedAt, time.GetUtcNow().UtcDateTime));
//        }
//        catch (Exception ex)
//        {
//            logger.LogWarning(ex, "Failed to update LastUsedAt for key {KeyId}", keyId);
//        }
//    }
//}


//public class ApiKey
//{
//    public Guid Id { get; set; } = Guid.NewGuid();

//    public string Prefix { get; set; } = default!;

//    public string KeyHash { get; set; } = default!;

//    public string Name { get; set; } = default!;

//    public string OwnerId { get; set; } = default!;

//    public string Scopes { get; set; } = string.Empty;

//    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

//    public DateTime? ExpiresAt { get; set; }

//    public DateTime? RevokedAt { get; set; }

//    public DateTime? LastUsedAt { get; set; }

//    public bool IsActive(TimeProvider time) =>
//        RevokedAt is null && (ExpiresAt is null || ExpiresAt > time.GetUtcNow());
//}

//public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
//{
//    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();

//    protected override void OnModelCreating(ModelBuilder modelBuilder)
//    {
//        modelBuilder.Entity<ApiKey>(entity =>
//        {
//            entity.HasKey(k => k.Id);
//            entity.Property(k => k.Prefix).IsRequired().HasMaxLength(20);
//            entity.Property(k => k.KeyHash).IsRequired().HasMaxLength(64);
//            entity.Property(k => k.Name).IsRequired().HasMaxLength(100);
//            entity.Property(k => k.OwnerId).IsRequired().HasMaxLength(100);
//            entity.Property(k => k.Scopes).HasMaxLength(500);

//            entity.HasIndex(k => k.KeyHash).IsUnique();
//            entity.HasIndex(k => k.Prefix);
//        });
//    }
//}