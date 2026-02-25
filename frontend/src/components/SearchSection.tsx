"use client";

import { useState, useCallback } from "react";
import { searchTestCases } from "../lib/api";
import type { SearchResult } from "../types";

interface SearchSectionProps {
  onSearchStart: () => void;
  onSearchComplete: (query: string, results: SearchResult[]) => void;
  onSearchError: (message: string) => void;
}

export default function SearchSection({
  onSearchStart,
  onSearchComplete,
  onSearchError,
}: SearchSectionProps) {
  const [userStory, setUserStory] = useState("");
  const [topK, setTopK] = useState(5);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmed = userStory.trim();
    if (!trimmed || isSearching) return;

    setIsSearching(true);
    onSearchStart();

    try {
      const res = await searchTestCases(trimmed, topK);
      onSearchComplete(trimmed, res.results);
    } catch (err) {
      onSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [userStory, topK, isSearching, onSearchStart, onSearchComplete, onSearchError]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const isDisabled = !userStory.trim() || isSearching;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Search by User Story
      </h2>

      <div>
        <textarea
          value={userStory}
          onChange={(e) => setUserStory(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your user story... e.g., As a user, I want to reset my password so I can regain access to my account"
          rows={3}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSearch}
            disabled={isDisabled}
            className={`
              inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors
              ${isDisabled ? "cursor-not-allowed bg-slate-300" : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"}
            `}
          >
            {isSearching && (
              <svg
                className="h-4 w-4 animate-spin"
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
            )}
            {isSearching ? "Searching..." : "Find Relevant Tests"}
          </button>

          <div className="flex items-center gap-2 text-sm text-slate-500">
            <label htmlFor="topK">Results:</label>
            <select
              id="topK"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </div>

          <span className="ml-auto text-xs text-slate-400">
            {"\u2318"}+Enter to search
          </span>
        </div>
      </div>
    </section>
  );
}
