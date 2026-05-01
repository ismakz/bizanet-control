import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: string;
  trendUp?: boolean;
}

export function StatCard({ title, value, icon: Icon, trend, trendUp }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#0B131E]/80 backdrop-blur-md p-5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        {Icon && <Icon className="w-16 h-16 text-cyan" />}
      </div>
      
      <div className="relative z-10">
        <h3 className="text-sm font-medium text-white/50">{title}</h3>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-white">{value}</span>
          {trend && (
            <span className={`text-xs font-medium ${trendUp ? "text-green-400" : "text-red-400"}`}>
              {trendUp ? "+" : ""}{trend}
            </span>
          )}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan/0 via-cyan/20 to-blue/0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
