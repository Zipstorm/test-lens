"use client";

import { useState } from "react";
import { suggestTestCases } from "../lib/api";
import type { SuggestedTestCase } from "../types";

interface SuggestionsSectionProps {
  userStory: string;
  existingTests: string[];
}

function SuggestionCard({ suggestion }: { suggestion: SuggestedTestCase }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm border-l-4 border-l-blue-400 dark:border-slate-700 dark:bg-slate-900">
      <div className="p-4">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {suggestion.title}
        </p>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
          {expanded ? "Hide details" : "Show steps & rationale"}
        </button>

        {expanded && (
          <div className="mt-2 space-y-3 rounded bg-slate-50 p-3 dark:bg-slate-800">
            {suggestion.steps.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Steps
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  {suggestion.steps.map((s, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-medium">{s.action}</span>
                      {s.expected && (
                        <span className="text-slate-400">
                          {" "}
                          &rarr; {s.expected}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Rationale
              </p>
              <p className="text-xs leading-relaxed text-slate-600">
                {suggestion.rationale}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SuggestionsSection({
  userStory,
  existingTests,
}: SuggestionsSectionProps) {
  const [suggestions, setSuggestions] = useState<SuggestedTestCase[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = async () => {
    setStatus("loading");
    setError(null);
    try {
      const result = await suggestTestCases(userStory, existingTests);
      setSuggestions(result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate suggestions");
      setStatus("error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Missing Test Cases
        </h3>
        {status !== "loading" && (
          <button
            onClick={handleSuggest}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {status === "done" ? "Regenerate" : "Suggest New Tests"}
          </button>
        )}
      </div>

      {status === "loading" && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <svg
            className="h-4 w-4 animate-spin text-blue-600"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Analyzing coverage gaps...
          </span>
        </div>
      )}

      {status === "error" && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {status === "done" && suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((s, i) => (
            <SuggestionCard key={i} suggestion={s} />
          ))}
        </div>
      )}

      {status === "done" && suggestions.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No additional test cases suggested — your existing coverage looks
            good!
          </p>
        </div>
      )}
    </div>
  );
}
