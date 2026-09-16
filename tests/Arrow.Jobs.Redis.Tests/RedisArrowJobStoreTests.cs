using Arrow.Jobs;
using Arrow.Jobs.Redis;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;
using Xunit;

namespace Arrow.Jobs.Redis.Tests;

public class RedisArrowJobStoreTests : IClassFixture<RedisConnectionFixture>
{
    private readonly RedisConnectionFixture _fixture;

    public RedisArrowJobStoreTests(RedisConnectionFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task Create_Get_ReturnsSameJob()
    {
        RedisArrowJobStore<TestRequest> store = new(_fixture.Redis);

        var job = await store.CreateAsync(new TestRequest { Value = 42 });

        ArrowJob<TestRequest>? retrieved = await store.GetAsync(job.Id);

        Assert.NotNull(retrieved);
        Assert.Equal(job.Id, retrieved!.Id);
        Assert.Equal(42, retrieved.Request.Value);
        Assert.Equal(ArrowJobState.Queued, retrieved.State);
    }

    [Fact]
    public async Task MarkCompleted_SetsTerminalState_WithTtl()
    {
        RedisArrowJobStore<TestRequest> store = new(_fixture.Redis);

        var job = await store.CreateAsync(new TestRequest());
        await store.MarkRunningAsync(job.Id);
        await store.MarkCompletedAsync(job.Id, "some/path.arrow");

        ArrowJob<TestRequest>? completed = await store.GetAsync(job.Id);

        Assert.NotNull(completed);
        Assert.Equal(ArrowJobState.Completed, completed!.State);
        Assert.NotNull(completed.ResultPath);
        Assert.NotNull(completed.CompletedAt);

        TimeSpan? ttl = await _fixture.Redis.GetDatabase().KeyTimeToLiveAsync($"arrow:job:{job.Id:N}");
        Assert.NotNull(ttl);
        Assert.True(ttl.Value.TotalDays <= 15, "Terminal job TTL 15 günden uzun olmamalı.");
    }

    [Fact]
    public async Task TryCancel_ReturnsFalse_IfAlreadyCompleted()
    {
        RedisArrowJobStore<TestRequest> store = new(_fixture.Redis);

        var job = await store.CreateAsync(new TestRequest());
        await store.MarkRunningAsync(job.Id);
        await store.MarkCompletedAsync(job.Id, "result");

        bool cancelled = await store.TryCancelAsync(job.Id);

        Assert.False(cancelled);
    }

    [Fact]
    public async Task FindDuplicate_ReturnsRunningJob()
    {
        RedisArrowJobStore<TestRequest> store = new(_fixture.Redis);

        var job = await store.CreateAsync(new TestRequest { Value = 99 }, name: "dup-test");
        await store.MarkRunningAsync(job.Id);

        ArrowJob<TestRequest>? dup = await store.FindDuplicateAsync(new TestRequest { Value = 99 }, name: "dup-test");

        Assert.NotNull(dup);
        Assert.Equal(job.Id, dup!.Id);
    }

    [Fact]
    public async Task TryDelete_RemovesKey()
    {
        RedisArrowJobStore<TestRequest> store = new(_fixture.Redis);

        var job = await store.CreateAsync(new TestRequest());

        bool deleted = await store.TryDeleteAsync(job.Id);

        Assert.True(deleted);
        ArrowJob<TestRequest>? gone = await store.GetAsync(job.Id);
        Assert.Null(gone);
    }

    [Fact]
    public async Task GenericlessStore_ResolvedInDI()
    {
        var services = new ServiceCollection();

        RedisArrowJobStore<TestRequest> redisStore = new(_fixture.Redis);
        services.AddSingleton<IArrowJobStore<TestRequest>>(_ => redisStore);
        services.AddSingleton<IArrowJobStore>(sp => (IArrowJobStore)sp.GetRequiredService<IArrowJobStore<TestRequest>>());

        IServiceProvider provider = services.BuildServiceProvider();

        IArrowJobStore genericStore = provider.GetRequiredService<IArrowJobStore>();
        Assert.Same(redisStore, genericStore);
    }
}

public sealed class TestRequest
{
    public int Value { get; init; }
}

/// <summary>
/// Local Redis'e (localhost:6379) bağlanır. Redis yoksa InitializeAsync'te exception fırlatır,
/// tüm test class'ı "failed" (reddedilen bağlantı) olarak raporlanır.
/// </summary>
public sealed class RedisConnectionFixture : IAsyncLifetime
{
    public IConnectionMultiplexer Redis { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Redis = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions
        {
            EndPoints = new EndPointCollection { "localhost:6379" },
            ConnectTimeout = 1_500,
            SyncTimeout = 3_000
        });
        if (!Redis.IsConnected)
            throw new InvalidOperationException("Local Redis (localhost:6379) bulunamadı.");
    }

    public Task DisposeAsync()
    {
        Redis?.Dispose();
        return Task.CompletedTask;
    }
}
