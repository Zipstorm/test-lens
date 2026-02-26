"use client";

import { useState } from "react";
import type { SearchHistoryEntry } from "../types";

interface SearchHistoryProps {
  history: SearchHistoryEntry[];
  onRerun: (query: string, topK: number) => void;
  onClear: () => void;
}

function timeAgo(timestamp: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SearchHistory({
  history,
  onRerun,
  onClear,
}: SearchHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (history.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-2">
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
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Recent Searches
          <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            {history.length}
          </span>
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => onRerun(entry.query, entry.topK)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {entry.query.length > 60
                      ? entry.query.slice(0, 60) + "..."
                      : entry.query}
                  </span>
                  <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {entry.resultsCount} results
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {timeAgo(entry.timestamp)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-200 px-4 py-2 dark:border-slate-700">
            <button
              onClick={onClear}
              className="text-xs text-slate-400 transition-colors hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
            >
              Clear history
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
