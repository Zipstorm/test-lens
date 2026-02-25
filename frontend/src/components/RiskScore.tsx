interface RiskScoreProps {
  score: number;
}

export default function RiskScore({ score }: RiskScoreProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500">Risk</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full ${
              i < score ? "bg-red-400" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-slate-400">{score}/5</span>
    </div>
  );
}
