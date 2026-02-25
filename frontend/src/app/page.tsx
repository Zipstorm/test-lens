"use client";

import { useState } from "react";
import Header from "../components/Header";
import UploadSection from "../components/UploadSection";
import SearchSection from "../components/SearchSection";
import ResultsSection from "../components/ResultsSection";
import type { SearchResult } from "../types";

type Tab = "upload" | "search";

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

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <Header />

      <div className="border-b border-slate-200">
        <nav className="flex gap-0" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "upload"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Upload
          </button>
          <button
            onClick={() => setActiveTab("search")}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "search"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Search
          </button>
        </nav>
      </div>

      {activeTab === "upload" && (
        <UploadSection onUploadComplete={handleUploadComplete} />
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
        </div>
      )}
    </main>
  );
}
