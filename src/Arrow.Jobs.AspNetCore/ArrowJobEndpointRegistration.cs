namespace Arrow.Jobs.AspNetCore;

/// <summary>
/// <see cref="ArrowJobApiBuilderExtensions.AddJob{T}"/> ile kaydedilen job HTTP endpoint bilgisi.
/// </summary>
internal sealed record ArrowJobEndpointRegistration(Type ServiceType, string NameOrPath);
