export function statusTone(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "Completed":
      return "default"
    case "Failed":
    case "Cancelled":
      return "destructive"
    case "Running":
    case "Queued":
      return "secondary"
    default:
      return "outline"
  }
}
