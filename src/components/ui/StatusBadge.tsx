type Status = "ACTIVE" | "PENDING" | "SUSPENDED" | "EXPIRED" | "BLOCKED" | "ONLINE" | "OFFLINE" | "UNKNOWN" | "APPROVED" | "REJECTED" | "CANCELLED";

export function StatusBadge({ status }: { status: Status | string }) {
  let bg = "bg-gray-500/10";
  let text = "text-gray-400";
  let border = "border-gray-500/20";

  if (["ACTIVE", "ONLINE", "APPROVED"].includes(status)) {
    bg = "bg-green-500/10";
    text = "text-green-400";
    border = "border-green-500/20";
  } else if (["PENDING"].includes(status)) {
    bg = "bg-yellow-500/10";
    text = "text-yellow-400";
    border = "border-yellow-500/20";
  } else if (["SUSPENDED", "EXPIRED", "OFFLINE", "REJECTED", "CANCELLED", "BLOCKED"].includes(status)) {
    bg = "bg-red-500/10";
    text = "text-red-400";
    border = "border-red-500/20";
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${bg} ${text} ${border}`}>
      {status}
    </span>
  );
}
