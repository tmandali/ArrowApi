using Arrow.Http.AspNetCore;

namespace Arrow.Http.SampleHost.Endpoints;

public static class ResultPatternEndpoints
{
    public static IEndpointRouteBuilder MapResultPatternEndpoints(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        endpoints.MapGet("/arrow/result-demo/{id}", GetResultDemo);

        return endpoints;
    }

    private static IResult GetResultDemo(int id)
    {
        if (id <= 0)
            return Result<ResultSampleDto>.BadRequest("ID değeri 0'dan büyük olmalıdır.").ToHttpResult();

        if (id > 100)
            return Result<ResultSampleDto>.NotFound($"ID '{id}' olan kayıt bulunamadı.").ToHttpResult();

        var dto = new ResultSampleDto { Id = id, Name = $"Sample_{id}", CreatedAt = DateTime.UtcNow };
        return Result<ResultSampleDto>.Success(dto).ToHttpResult();
    }

    private class ResultSampleDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
    }
}
