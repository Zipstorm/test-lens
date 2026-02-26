"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "../components/Header";
import UploadSection from "../components/UploadSection";
import JiraImportSection from "../components/JiraImportSection";
import SearchSection from "../components/SearchSection";
import ResultsSection from "../components/ResultsSection";
import SuggestionsSection from "../components/SuggestionsSection";
import IndexStatsCard from "../components/IndexStatsCard";
import SearchHistory from "../components/SearchHistory";
import CoverageHeatmap from "../components/CoverageHeatmap";
import type { SearchResult, SearchHistoryEntry } from "../types";

const HISTORY_KEY = "testlens-search-history";
const MAX_HISTORY = 10;

function loadHistory(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: SearchHistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage might be full or unavailable
  }
}

type Tab = "upload" | "jira" | "search" | "insights";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [isUploaded, setIsUploaded] = useState(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "searching" | "done" | "error"
  >("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  // Search history (localStorage-backed)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [externalQuery, setExternalQuery] = useState<{
    query: string;
    topK: number;
  } | null>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    setSearchHistory(loadHistory());
  }, []);

  const handleUploadComplete = () => {
    setIsUploaded(true);
  };

  const handleImportComplete = () => {
    setIsUploaded(true);
  };

  const handleSearchStart = () => {
    setSearchStatus("searching");
    setSearchError(null);
  };

  const handleSearchComplete = useCallback(
    (query: string, newResults: SearchResult[]) => {
      setLastQuery(query);
      setResults(newResults);
      setSearchStatus("done");
      setSearchError(null);

      // Add to search history
      const entry: SearchHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        query,
        resultsCount: newResults.length,
        topK: newResults.length, // actual returned count
        timestamp: new Date().toISOString(),
      };

      setSearchHistory((prev) => {
        // Deduplicate: remove any existing entry with the same query
        const filtered = prev.filter((e) => e.query !== query);
        const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
        saveHistory(updated);
        return updated;
      });
    },
    []
  );

  const handleSearchError = (message: string) => {
    setSearchStatus("error");
    setSearchError(message);
  };

  const handleRerun = useCallback((query: string, topK: number) => {
    setExternalQuery({ query, topK });
  }, []);

  const handleClearHistory = useCallback(() => {
    setSearchHistory([]);
    saveHistory([]);
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "jira", label: "Jira Import" },
    { key: "search", label: "Search" },
    { key: "insights", label: "Insights" },
  ];

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <Header />

      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-0" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "upload" && (
        <UploadSection onUploadComplete={handleUploadComplete} />
      )}

      {activeTab === "jira" && (
        <JiraImportSection onImportComplete={handleImportComplete} />
      )}

      {activeTab === "search" && (
        <div className="space-y-4">
          <IndexStatsCard />
          <SearchSection
            onSearchStart={handleSearchStart}
            onSearchComplete={handleSearchComplete}
            onSearchError={handleSearchError}
            externalQuery={externalQuery}
          />
          <SearchHistory
            history={searchHistory}
            onRerun={handleRerun}
            onClear={handleClearHistory}
          />
          <ResultsSection
            results={results}
            status={searchStatus}
            error={searchError}
            userStory={lastQuery}
          />
          {searchStatus === "done" && results.length > 0 && (
            <SuggestionsSection
              userStory={lastQuery}
              existingTests={results.map((r) => r.testCase)}
            />
          )}
        </div>
      )}

      {activeTab === "insights" && <CoverageHeatmap />}
    </main>
  );
}
