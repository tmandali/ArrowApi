namespace Arrow.Jobs.AspNetCore;

/// <summary><see cref="ArrowJobsServiceCollectionExtensions.AddArrowJob{T}"/> ile kaydedilen job HTTP route.</summary>
internal sealed record ArrowJobEndpointRegistration(Type ServiceType, string Path);
