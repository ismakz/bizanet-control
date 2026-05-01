export function RoleBadge({ role }: { role: string }) {
  let bg = "bg-gray-500/10";
  let text = "text-gray-400";
  let border = "border-gray-500/20";
  let label = role;

  if (role === "BIZANET_CEO") {
    bg = "bg-cyan/10";
    text = "text-cyan";
    border = "border-cyan/20";
    label = "CEO";
  } else if (role === "COMPANY_ADMIN") {
    bg = "bg-blue-500/10";
    text = "text-blue-400";
    border = "border-blue-500/20";
    label = "ADMIN";
  } else if (role === "COMPANY_AGENT") {
    bg = "bg-purple-500/10";
    text = "text-purple-400";
    border = "border-purple-500/20";
    label = "AGENT";
  }

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${bg} ${text} ${border}`}>
      {label}
    </span>
  );
}
