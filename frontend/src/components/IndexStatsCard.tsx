"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchIndexStats } from "../lib/api";
import type { IndexStats } from "../types";

export default function IndexStatsCard() {
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchIndexStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="flex items-center gap-2 text-sm">
        <svg
          className="h-4 w-4 text-slate-400 dark:text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
          />
        </svg>
        <span className="font-medium text-slate-600 dark:text-slate-300">
          Index
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
          <svg
            className="h-3.5 w-3.5 animate-spin"
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
          Loading...
        </div>
      )}

      {!isLoading && error && (
        <span className="text-sm text-red-500 dark:text-red-400">{error}</span>
      )}

      {!isLoading && stats && (
        <>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {stats.totalVectors.toLocaleString()}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              test cases indexed
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-600">|</span>

          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {stats.dimension}
            </span>
            <span className="text-slate-500 dark:text-slate-400">dims</span>
          </div>
        </>
      )}

      <button
        onClick={loadStats}
        disabled={isLoading}
        className="ml-auto rounded p-1 text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-slate-300"
        title="Refresh stats"
      >
        <svg
          className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
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
  );
}
