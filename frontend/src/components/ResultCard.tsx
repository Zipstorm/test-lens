"use client";

import { useState } from "react";
import RelevanceBadge from "./RelevanceBadge";
import RiskScore from "./RiskScore";
import type { SearchResult } from "../types";

const borderColorMap = {
  high: "border-l-emerald-400",
  medium: "border-l-amber-400",
  low: "border-l-slate-300",
};

interface ResultCardProps {
  result: SearchResult;
  index: number;
  defaultExpanded?: boolean;
}

export default function ResultCard({
  result,
  index,
  defaultExpanded = false,
}: ResultCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white shadow-sm border-l-4 ${borderColorMap[result.relevance]}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <span className="mt-0.5 flex-shrink-0 text-xs font-medium text-slate-400">
              #{index + 1}
            </span>
            <p className="text-sm font-medium text-slate-800">
              {result.testCase}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <RelevanceBadge relevance={result.relevance} />
            <RiskScore score={result.riskScore} />
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <svg
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          {expanded ? "Hide reason" : "Show reason"}
        </button>

        {expanded && (
          <p className="mt-2 rounded bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            {result.reason}
          </p>
        )}
      </div>
    </div>
  );
}
