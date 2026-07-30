using Arrow.Jobs.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization;

namespace Arrow.Jobs.AspNetCore;

public static class ArrowJobAuthorizationExtensions
{
    /// <summary>
    /// Politikaya mesai saatleri (09:00 - 18:00) kuralını ekler.
    /// </summary>
    public static AuthorizationPolicyBuilder RequireWorkingHours(
        this AuthorizationPolicyBuilder policyBuilder)
    {
        return policyBuilder.AddRequirements(new WorkingHoursRequirement());
    }
}