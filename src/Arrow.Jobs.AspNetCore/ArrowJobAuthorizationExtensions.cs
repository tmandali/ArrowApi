using Arrow.Jobs.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization;

namespace Arrow.Jobs.AspNetCore;

public static class ArrowJobAuthorizationExtensions
{
    /// <summary>
    /// Politikaya mesai saatleri kuralını ekler (varsayılan: 09:00 - 18:00).
    /// </summary>
    public static AuthorizationPolicyBuilder RequireWorkingHours(
        this AuthorizationPolicyBuilder policyBuilder,
        int startHour = 9,
        int startMinute = 0,
        int endHour = 18,
        int endMinute = 0)
    {
        return policyBuilder.AddRequirements(new WorkingHoursRequirement(startHour, startMinute, endHour, endMinute));
    }

    /// <summary>
    /// Politikaya mesai saatleri kuralını <see cref="TimeSpan"/> ile ekler.
    /// </summary>
    public static AuthorizationPolicyBuilder RequireWorkingHours(
        this AuthorizationPolicyBuilder policyBuilder,
        TimeSpan startTime,
        TimeSpan endTime)
    {
        return policyBuilder.AddRequirements(new WorkingHoursRequirement(startTime, endTime));
    }

    /// <summary>
    /// Politikaya mesai saatleri kuralını <see cref="TimeOnly"/> ile ekler.
    /// </summary>
    public static AuthorizationPolicyBuilder RequireWorkingHours(
        this AuthorizationPolicyBuilder policyBuilder,
        TimeOnly startTime,
        TimeOnly endTime)
    {
        return policyBuilder.AddRequirements(new WorkingHoursRequirement(startTime, endTime));
    }
}