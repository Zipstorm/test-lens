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

function MetadataPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
      <span className="text-slate-400">{label}:</span> {value}
    </span>
  );
}

function StepsList({ stepsJson }: { stepsJson: string }) {
  try {
    const steps = JSON.parse(stepsJson) as {
      action: string;
      data: string;
      result: string;
    }[];
    if (steps.length === 0) return null;
    return (
      <div className="mt-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Steps
        </p>
        <ol className="list-decimal list-inside space-y-1">
          {steps.map((s, i) => (
            <li key={i} className="text-xs text-slate-600">
              <span className="font-medium">{s.action}</span>
              {s.data && (
                <span className="text-slate-400"> | Data: {s.data}</span>
              )}
              {s.result && (
                <span className="text-slate-400">
                  {" "}
                  | Expected: {s.result}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  } catch {
    return null;
  }
}

function PreconditionsList({ preJson }: { preJson: string }) {
  try {
    const pcs = JSON.parse(preJson) as {
      key: string;
      definition: string;
    }[];
    if (pcs.length === 0) return null;
    return (
      <div className="mt-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Preconditions
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          {pcs.map((p, i) => (
            <li key={i} className="text-xs text-slate-600">
              {p.key && (
                <span className="font-medium text-blue-600">{p.key}: </span>
              )}
              {p.definition}
            </li>
          ))}
        </ul>
      </div>
    );
  } catch {
    return null;
  }
}

export default function ResultCard({
  result,
  index,
  defaultExpanded = false,
}: ResultCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasMetadata =
    result.issueKey || result.testType || result.folder || result.steps || result.preconditions;

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
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">
                {result.testCase}
              </p>
              {hasMetadata && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {result.issueKey && (
                    <MetadataPill label="Key" value={result.issueKey} />
                  )}
                  {result.testType && (
                    <MetadataPill label="Type" value={result.testType} />
                  )}
                  {result.folder && (
                    <MetadataPill
                      label="Folder"
                      value={result.folder.replace(/^\/+/, "").replace(/\//g, " > ")}
                    />
                  )}
                </div>
              )}
            </div>
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
          {expanded ? "Hide details" : "Show details"}
        </button>

        {expanded && (
          <div className="mt-2 rounded bg-slate-50 p-3 space-y-2">
            <p className="text-xs leading-relaxed text-slate-600">
              {result.reason}
            </p>

            {result.steps && <StepsList stepsJson={result.steps} />}
            {result.preconditions && (
              <PreconditionsList preJson={result.preconditions} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
