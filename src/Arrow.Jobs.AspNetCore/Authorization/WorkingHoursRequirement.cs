using Microsoft.AspNetCore.Authorization;

namespace Arrow.Jobs.AspNetCore.Authorization;

public sealed class WorkingHoursRequirement : IAuthorizationRequirement
{
    public TimeSpan StartTime { get; }
    public TimeSpan EndTime { get; }

    public WorkingHoursRequirement(TimeSpan startTime, TimeSpan endTime)
    {
        StartTime = startTime;
        EndTime = endTime;
    }

    public WorkingHoursRequirement(TimeOnly startTime, TimeOnly endTime)
        : this(startTime.ToTimeSpan(), endTime.ToTimeSpan())
    {
    }

    public WorkingHoursRequirement(int startHour = 9, int startMinute = 0, int endHour = 18, int endMinute = 0)
        : this(new TimeSpan(startHour, startMinute, 0), new TimeSpan(endHour, endMinute, 0))
    {
    }
}
