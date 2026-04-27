import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({ value = 0, className }: { value?: number | null; className?: string }) {
  const normalized = Math.max(0, Math.min(100, Number(value ?? 0)));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full bg-slate-950 transition-all duration-500" style={{ width: `${normalized}%` }} />
    </div>
  );
}
