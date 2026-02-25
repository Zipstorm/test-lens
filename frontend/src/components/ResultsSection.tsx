"use client";

import { useState } from "react";
import ResultCard from "./ResultCard";
import type { SearchResult } from "../types";

type RelevanceFilter = "all" | "high" | "medium" | "low";

interface ResultsSectionProps {
  results: SearchResult[];
  status: "idle" | "searching" | "done" | "error";
  error: string | null;
  userStory: string;
}

export default function ResultsSection({
  results,
  status,
  error,
  userStory,
}: ResultsSectionProps) {
  const [filter, setFilter] = useState<RelevanceFilter>("all");

  if (status === "idle") return null;

  const relevanceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedResults = [...results].sort(
    (a, b) => (relevanceOrder[a.relevance] ?? 3) - (relevanceOrder[b.relevance] ?? 3)
  );
  const filteredResults =
    filter === "all" ? sortedResults : sortedResults.filter((r) => r.relevance === filter);

  const filterOptions: { value: RelevanceFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Results</h2>
        {status === "done" && results.length > 0 && (
          <div className="flex gap-1">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {status === "searching" && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-8">
          <svg
            className="h-5 w-5 animate-spin text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
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
          <div>
            <p className="text-sm font-medium text-slate-700">
              Finding relevant tests...
            </p>
            <p className="text-xs text-slate-400">
              Embedding your story, searching vectors, and analyzing matches
              with AI.
            </p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {status === "done" && results.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No matching test cases found for this user story.
          </p>
        </div>
      )}

      {status === "done" && results.length > 0 && (
        <div>
          <p className="mb-4 text-sm text-slate-500">
            Found{" "}
            <span className="font-medium text-slate-700">
              {filteredResults.length}
            </span>{" "}
            {filter !== "all" && (
              <span className="font-medium text-slate-700">{filter} relevance </span>
            )}
            relevant tests for{" "}
            <span className="font-medium text-slate-700">
              &ldquo;
              {userStory.length > 80
                ? userStory.substring(0, 80) + "..."
                : userStory}
              &rdquo;
            </span>
          </p>
          {filteredResults.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-500">
                No {filter} relevance results found.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredResults.map((result, i) => (
                <ResultCard
                  key={i}
                  result={result}
                  index={i}
                  defaultExpanded={i < 3}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
