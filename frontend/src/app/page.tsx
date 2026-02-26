"use client";

import { useState } from "react";
import Header from "../components/Header";
import UploadSection from "../components/UploadSection";
import JiraImportSection from "../components/JiraImportSection";
import SearchSection from "../components/SearchSection";
import ResultsSection from "../components/ResultsSection";
import SuggestionsSection from "../components/SuggestionsSection";
import type { SearchResult } from "../types";

type Tab = "upload" | "jira" | "search";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [isUploaded, setIsUploaded] = useState(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "searching" | "done" | "error"
  >("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");

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

  const handleSearchComplete = (query: string, newResults: SearchResult[]) => {
    setLastQuery(query);
    setResults(newResults);
    setSearchStatus("done");
    setSearchError(null);
  };

  const handleSearchError = (message: string) => {
    setSearchStatus("error");
    setSearchError(message);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "jira", label: "Jira Import" },
    { key: "search", label: "Search" },
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
        <div className="space-y-8">
          <SearchSection
            onSearchStart={handleSearchStart}
            onSearchComplete={handleSearchComplete}
            onSearchError={handleSearchError}
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
    </main>
  );
}
