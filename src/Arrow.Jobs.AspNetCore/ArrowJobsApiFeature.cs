using Arrow.Http.AspNetCore;

namespace Arrow.Jobs.AspNetCore;

internal sealed class ArrowJobsApiFeature : IArrowApiFeature
{
    public void Use(WebApplication app) => app.MapArrowJob();
}
