using Microsoft.AspNetCore.Authorization;

namespace Arrow.Jobs.AspNetCore.Authorization;

public sealed class WorkingHoursRequirement : IAuthorizationRequirement
{
    public TimeSpan StartTime { get; } = new(9, 0, 0);  // 09:00
    public TimeSpan EndTime { get; } = new(18, 0, 0);   // 18:00
}
