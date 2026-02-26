interface RiskScoreProps {
  score: number;
}

export default function RiskScore({ score }: RiskScoreProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500 dark:text-slate-400">Risk</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full ${
              i < score ? "bg-red-400" : "bg-slate-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-slate-400 dark:text-slate-500">{score}/5</span>
    </div>
  );
}
