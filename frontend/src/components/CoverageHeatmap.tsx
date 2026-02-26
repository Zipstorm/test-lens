"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchCoverage } from "../lib/api";
import type { CoverageData, CoverageBreakdown } from "../types";

type ViewMode = "module" | "source" | "testType";

const VIEW_LABELS: Record<ViewMode, string> = {
  module: "By Module",
  source: "By Source",
  testType: "By Test Type",
};

// Heatmap color palette — from cool to warm as density increases
const HEAT_COLORS = [
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500 dark:bg-emerald-400" },
  { bg: "bg-teal-100 dark:bg-teal-900/40", text: "text-teal-700 dark:text-teal-300", bar: "bg-teal-500 dark:bg-teal-400" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", text: "text-cyan-700 dark:text-cyan-300", bar: "bg-cyan-500 dark:bg-cyan-400" },
  { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", bar: "bg-blue-500 dark:bg-blue-400" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", text: "text-indigo-700 dark:text-indigo-300", bar: "bg-indigo-500 dark:bg-indigo-400" },
  { bg: "bg-violet-100 dark:bg-violet-900/40", text: "text-violet-700 dark:text-violet-300", bar: "bg-violet-500 dark:bg-violet-400" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", bar: "bg-purple-500 dark:bg-purple-400" },
  { bg: "bg-fuchsia-100 dark:bg-fuchsia-900/40", text: "text-fuchsia-700 dark:text-fuchsia-300", bar: "bg-fuchsia-500 dark:bg-fuchsia-400" },
  { bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-700 dark:text-pink-300", bar: "bg-pink-500 dark:bg-pink-400" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-500 dark:bg-rose-400" },
  { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", bar: "bg-orange-500 dark:bg-orange-400" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500 dark:bg-amber-400" },
];

function getColor(index: number) {
  return HEAT_COLORS[index % HEAT_COLORS.length];
}

/**
 * Prettify raw source strings like "xray:QA:QA-851" → { label: "QA-851", badge: "Xray" }
 * Handles: "xray:PROJ:KEY", "jira:PROJ:KEY", "xray:PROJ", "jira:PROJ", filenames
 */
function formatSourceName(raw: string): { label: string; badge?: string } {
  const parts = raw.split(":");
  if (parts.length >= 2 && (parts[0] === "xray" || parts[0] === "jira")) {
    const provider = parts[0] === "xray" ? "Xray" : "Jira";
    // "xray:QA:QA-851" → ticket "QA-851", "xray:QA" → project "QA"
    const label = parts.length >= 3 ? parts.slice(2).join(":") : parts[1];
    return { label, badge: provider };
  }
  // File uploads — just the filename
  return { label: raw };
}

function BreakdownChart({
  items,
  maxCount,
  viewMode,
}: {
  items: CoverageBreakdown[];
  maxCount: number;
  viewMode: ViewMode;
}) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
        No data available for this breakdown.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
        const color = getColor(i);

        const formatted = viewMode === "source" ? formatSourceName(item.name) : null;

        return (
          <div key={item.name} className="group">
            <div className="flex items-center gap-3">
              {/* Label */}
              <span
                className={`w-40 shrink-0 truncate text-right text-sm font-medium ${color.text}`}
                title={item.name}
              >
                {formatted ? (
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    {formatted.badge && (
                      <span className="rounded bg-slate-200 px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        {formatted.badge}
                      </span>
                    )}
                    {formatted.label}
                  </span>
                ) : (
                  item.name
                )}
              </span>

              {/* Bar */}
              <div className="relative flex-1 h-7 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-md transition-all duration-500 ease-out ${color.bar}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-xs font-semibold text-white drop-shadow-sm">
                    {pct >= 8 ? item.count.toLocaleString() : ""}
                  </span>
                </div>
              </div>

              {/* Count badge */}
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${color.bg} ${color.text}`}
              >
                {item.count.toLocaleString()}
              </span>

              {/* Percentage */}
              <span className="w-12 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                {pct.toFixed(1)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CoverageHeatmap() {
  const [data, setData] = useState<CoverageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("module");

  const loadCoverage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const coverage = await fetchCoverage();
      setData(coverage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coverage");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCoverage();
  }, [loadCoverage]);

  const currentItems: CoverageBreakdown[] = data
    ? viewMode === "module"
      ? data.byModule
      : viewMode === "source"
      ? data.bySource
      : data.byTestType
    : [];

  const maxCount = currentItems.reduce((max, item) => Math.max(max, item.count), 0);
  const totalInView = currentItems.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Test Coverage Insights
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Visualize how your test cases are distributed across your codebase
          </p>
        </div>

        <button
          onClick={loadCoverage}
          disabled={isLoading}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          title="Refresh coverage data"
        >
          <svg
            className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Summary cards */}
      {!isLoading && data && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-slate-700 dark:from-blue-950/30 dark:to-indigo-950/30">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Total Test Cases
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
              {data.totalVectors.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 dark:border-slate-700 dark:from-emerald-950/30 dark:to-teal-950/30">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Modules
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
              {data.byModule.length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-violet-50 to-purple-50 p-4 dark:border-slate-700 dark:from-violet-950/30 dark:to-purple-950/30">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Sources
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
              {data.bySource.length}
            </p>
          </div>
        </div>
      )}

      {/* View mode toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              viewMode === mode
                ? "bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {VIEW_LABELS[mode]}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <svg
            className="h-8 w-8 animate-spin text-blue-500"
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
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Analyzing coverage data...
          </p>
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800/50 dark:bg-red-950/20">
          <svg
            className="mx-auto h-8 w-8 text-red-400 dark:text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">
            {error}
          </p>
          <button
            onClick={loadCoverage}
            className="mt-3 text-sm font-medium text-red-600 underline hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && data && data.totalVectors === 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <svg
            className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
            No test cases indexed yet
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Upload test cases or import from Jira to see coverage insights
          </p>
        </div>
      )}

      {/* Heatmap chart */}
      {!isLoading && !error && data && data.totalVectors > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {VIEW_LABELS[viewMode]}
            </h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {currentItems.length} categories · {totalInView.toLocaleString()}{" "}
              test cases
            </span>
          </div>

          <BreakdownChart items={currentItems} maxCount={maxCount} viewMode={viewMode} />
        </div>
      )}
    </div>
  );
}
