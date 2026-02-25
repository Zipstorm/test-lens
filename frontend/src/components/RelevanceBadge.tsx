const colorMap = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

interface RelevanceBadgeProps {
  relevance: "high" | "medium" | "low";
}

export default function RelevanceBadge({ relevance }: RelevanceBadgeProps) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colorMap[relevance]}`}
    >
      {relevance}
    </span>
  );
}
