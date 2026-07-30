using Microsoft.AspNetCore.Authorization;
using System;
using System.Collections.Generic;
using System.Text;

namespace Arrow.Jobs.AspNetCore.Authorization;

public class WorkingHoursAuthorizationHandler : AuthorizationHandler<WorkingHoursRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        WorkingHoursRequirement requirement)
    {
        DateTime now = DateTime.Now;

        // 1. Hafta sonu kontrolü (Cumartesi veya Pazar ise geçersiz)
        if (now.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        {
            // context.Succeed() çağrılmadığı için otomatik 403 Forbidden döner
            return Task.CompletedTask;
        }

        // 2. Saat kontrolü (09:00 ile 18:00 arasında mı?)
        TimeSpan timeOfDay = now.TimeOfDay;
        if (timeOfDay >= requirement.StartTime && timeOfDay <= requirement.EndTime)
        {
            context.Succeed(requirement); // Şart sağlandı, erişime izin ver!
        }

        return Task.CompletedTask;
    }
}