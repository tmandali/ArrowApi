using Arrow;
using Arrow.Http.AspNetCore;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Arrow.Http.Client.Tests;

public class ResultPatternTests
{
    public class SampleDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    [Fact]
    public void Result_Success_creates_successful_result()
    {
        var dto = new SampleDto { Id = 1, Name = "Test" };
        var result = Result<SampleDto>.Success(dto);

        Assert.True(result.IsSuccess);
        Assert.Null(result.Error);
        Assert.Equal(200, result.StatusCode);
        Assert.Equal(dto, result.Value);
    }

    [Fact]
    public void Result_NotFound_creates_404_failure_result()
    {
        var result = Result<SampleDto>.NotFound("Item not found");

        Assert.False(result.IsSuccess);
        Assert.Equal("Item not found", result.Error);
        Assert.Equal(404, result.StatusCode);
        Assert.Null(result.Value);
    }

    [Fact]
    public void Result_BadRequest_creates_400_failure_result()
    {
        var result = Result<SampleDto>.BadRequest("Invalid ID");

        Assert.False(result.IsSuccess);
        Assert.Equal("Invalid ID", result.Error);
        Assert.Equal(400, result.StatusCode);
    }

    [Fact]
    public void Result_Conflict_creates_409_failure_result()
    {
        var result = Result<SampleDto>.Conflict("Duplicate record");

        Assert.False(result.IsSuccess);
        Assert.Equal("Duplicate record", result.Error);
        Assert.Equal(409, result.StatusCode);
    }

    [Fact]
    public void Result_Void_Success_creates_unit_success()
    {
        var result = Result.Success();

        Assert.True(result.IsSuccess);
        Assert.Equal(200, result.StatusCode);
    }

    [Fact]
    public void ToHttpResult_maps_success_to_Ok_IResult()
    {
        var dto = new SampleDto { Id = 10, Name = "Sample" };
        IResult httpResult = Result<SampleDto>.Success(dto).ToHttpResult();

        Assert.NotNull(httpResult);
    }

    [Fact]
    public void ToHttpResult_maps_not_found_to_NotFound_IResult()
    {
        IResult httpResult = Result<SampleDto>.NotFound("Not Found").ToHttpResult();

        Assert.NotNull(httpResult);
    }

    [Fact]
    public async Task ReadAsResultAsync_parses_successful_200_json_response()
    {
        using var response = new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent("{\"Id\": 5, \"Name\": \"Sample_5\"}", System.Text.Encoding.UTF8, "application/json")
        };

        Result<SampleDto> result = await response.ReadAsResultAsync<SampleDto>();

        Assert.True(result.IsSuccess);
        Assert.Equal(200, result.StatusCode);
        Assert.NotNull(result.Value);
        Assert.Equal(5, result.Value!.Id);
        Assert.Equal("Sample_5", result.Value.Name);
    }

    [Fact]
    public async Task ReadAsResultAsync_parses_404_not_found_error_response()
    {
        using var response = new HttpResponseMessage(System.Net.HttpStatusCode.NotFound)
        {
            Content = new StringContent("{\"error\": \"Kayıt bulunamadı\"}", System.Text.Encoding.UTF8, "application/json")
        };

        Result<SampleDto> result = await response.ReadAsResultAsync<SampleDto>();

        Assert.False(result.IsSuccess);
        Assert.Equal(404, result.StatusCode);
        Assert.Equal("Kayıt bulunamadı", result.Error);
    }

    [Fact]
    public void ThrowIfError_on_success_returns_same_result()
    {
        var dto = new SampleDto { Id = 1, Name = "Test" };
        var result = Result<SampleDto>.Success(dto);

        var chain = result.ThrowIfError();
        Assert.Same(result, chain);
    }

    [Fact]
    public void ThrowIfError_on_failure_throws_InvalidOperationException()
    {
        var result = Result<SampleDto>.NotFound("Resource missing");

        var ex = Assert.Throws<InvalidOperationException>(() => result.ThrowIfError());
        Assert.Contains("Resource missing", ex.Message);
        Assert.Contains("404", ex.Message);
    }

    [Fact]
    public void GetValueOrThrow_returns_value_or_throws()
    {
        var dto = new SampleDto { Id = 2, Name = "Sample2" };
        var successResult = Result<SampleDto>.Success(dto);

        Assert.Equal(dto, successResult.GetValueOrThrow());

        var failResult = Result<SampleDto>.BadRequest("Invalid input");
        Assert.Throws<InvalidOperationException>(() => failResult.GetValueOrThrow());
    }
}
