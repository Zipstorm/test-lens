"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchJiraProjects,
  fetchIssueTypes,
  fetchTicketsByType,
  importFromJira,
  importFromXray,
} from "../lib/api";
import type { JiraProject, JiraIssueType, JiraTicketSummary } from "../types";

/* ── Searchable select dropdown ─────────────────────────────────── */
interface SearchableSelectOption {
  value: string;
  label: string;
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
      setQuery("");
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <input
        ref={inputRef}
        type="text"
        className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        placeholder={placeholder}
        value={open ? query : selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
      />
      {/* dropdown chevron */}
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-400">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>

      {open && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded border border-slate-300 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">No matches</li>
          ) : (
            filtered.map((o) => (
              <li
                key={o.value}
                className={`cursor-pointer px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 ${
                  o.value === value
                    ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-slate-700 dark:text-slate-200"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus on input
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────── */
interface JiraImportSectionProps {
  onImportComplete: (count: number) => void;
}

type ImportStatus = "idle" | "loading-projects" | "ready" | "importing" | "success" | "error";
type ImportMode = "jira" | "xray";

export default function JiraImportSection({
  onImportComplete,
}: JiraImportSectionProps) {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [maxResults, setMaxResults] = useState(100);
  const [importMode, setImportMode] = useState<ImportMode>("xray");
  const [count, setCount] = useState(0);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");

  // Ticket type filter state
  const [issueTypes, setIssueTypes] = useState<JiraIssueType[]>([]);
  const [selectedIssueType, setSelectedIssueType] = useState("");
  const [tickets, setTickets] = useState<JiraTicketSummary[]>([]);
  const [selectedTicket, setSelectedTicket] = useState("");
  const [loadingIssueTypes, setLoadingIssueTypes] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const ALLOWED_TYPES = ["Epic", "Test Plan", "Test Set"];

  const loadIssueTypesFor = async (projectKey: string) => {
    setLoadingIssueTypes(true);
    try {
      const types = await fetchIssueTypes(projectKey);
      setIssueTypes(types.filter((t) => ALLOWED_TYPES.includes(t.name)));
    } catch (err) {
      console.error("Failed to load issue types:", err);
    } finally {
      setLoadingIssueTypes(false);
    }
  };

  const loadTicketsFor = async (projectKey: string, issueType: string) => {
    setLoadingTickets(true);
    try {
      const t = await fetchTicketsByType(projectKey, issueType);
      setTickets(t);
    } catch (err) {
      console.error("Failed to load tickets:", err);
    } finally {
      setLoadingTickets(false);
    }
  };

  const handleProjectChange = (key: string) => {
    setSelectedProject(key);
    setSelectedIssueType("");
    setTickets([]);
    setSelectedTicket("");
    loadIssueTypesFor(key);
  };

  const handleIssueTypeChange = (name: string) => {
    setSelectedIssueType(name);
    setTickets([]);
    setSelectedTicket("");
    if (name && selectedProject) {
      loadTicketsFor(selectedProject, name);
    }
  };

  const loadProjects = async () => {
    setStatus("loading-projects");
    setError("");
    try {
      const data = await fetchJiraProjects();
      setProjects(data);
      const qa = data.find((p) => p.key === "QA");
      const projectKey = qa ? qa.key : data[0]?.key ?? "";
      setSelectedProject(projectKey);
      setStatus("ready");
      if (projectKey) loadIssueTypesFor(projectKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
      setStatus("error");
    }
  };

  const handleImport = async () => {
    if (!selectedProject) return;
    setStatus("importing");
    setError("");

    try {
      const importFn = importMode === "xray" ? importFromXray : importFromJira;
      const parentKey = selectedTicket || undefined;
      const res = await importFn(selectedProject, maxResults, parentKey);
      setCount(res.count);
      setSource(res.source);
      setStatus("success");
      onImportComplete(res.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStatus("error");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setCount(0);
    setSource("");
    setError("");
    setIssueTypes([]);
    setSelectedIssueType("");
    setTickets([]);
    setSelectedTicket("");
  };

  const importDisabled = !!selectedIssueType && !selectedTicket;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Import from Jira
      </h2>

      {status === "idle" && (
        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6 text-center">
          <svg
            className="mx-auto mb-3 h-10 w-10 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Connect to Jira
          </p>
          <p className="mb-4 text-xs text-slate-400 dark:text-slate-500 dark:text-slate-500">
            Import test cases from a Jira project into the vector store
          </p>
          <button
            onClick={loadProjects}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
          >
            Load Jira Projects
          </button>
        </div>
      )}

      {status === "loading-projects" && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6">
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
          <p className="text-sm text-slate-600 dark:text-slate-300">Loading Jira projects...</p>
        </div>
      )}

      {status === "ready" && (
        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label
                htmlFor="jira-project"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Project
              </label>
              <select
                id="jira-project"
                value={selectedProject}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label
                htmlFor="max-results"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Max issues
              </label>
              <select
                id="max-results"
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
            </div>
          </div>

          {/* Filter by parent ticket type */}
          <div>
            <label
              htmlFor="issue-type"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Filter by parent ticket{" "}
              <span className="text-xs text-slate-400 dark:text-slate-500">(optional)</span>
            </label>
            {loadingIssueTypes ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Loading issue types...</p>
            ) : (
              <select
                id="issue-type"
                value={selectedIssueType}
                onChange={(e) => handleIssueTypeChange(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">Entire project (no filter)</option>
                {issueTypes.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Ticket picker — shown when issue type is selected */}
          {selectedIssueType && (
            <div>
              <label
                htmlFor="parent-ticket"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Select {selectedIssueType}
              </label>
              {loadingTickets ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Loading {selectedIssueType} tickets...
                </p>
              ) : tickets.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  No {selectedIssueType} tickets found in this project.
                </p>
              ) : (
                <SearchableSelect
                  options={tickets.map((t) => ({
                    value: t.key,
                    label: `${t.key} — ${t.summary}`,
                  }))}
                  value={selectedTicket}
                  onChange={setSelectedTicket}
                  placeholder={`Search ${selectedIssueType} tickets...`}
                />
              )}
            </div>
          )}

          {/* Import mode toggle */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Import source
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setImportMode("xray")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  importMode === "xray"
                    ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                Xray (with steps)
              </button>
              <button
                onClick={() => setImportMode("jira")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  importMode === "jira"
                    ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                Jira (summary only)
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {importMode === "xray"
                ? "Imports test steps, preconditions, and folder structure for richer embeddings"
                : "Imports issue summaries and labels from Jira directly"}
            </p>
          </div>

          <button
            onClick={handleImport}
            disabled={importDisabled}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedTicket
              ? `Import tests from ${selectedTicket}`
              : "Import Test Cases"}
          </button>
        </div>
      )}

      {status === "importing" && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6">
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
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Importing from {selectedTicket || selectedProject} via{" "}
              {importMode === "xray" ? "Xray" : "Jira"}...
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {importMode === "xray"
                ? "Fetching tests with steps & preconditions, embedding, and indexing."
                : "Fetching issues, embedding, and indexing."}{" "}
              This may take a moment.
            </p>
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 p-6">
          <div className="flex items-center gap-3">
            <svg
              className="h-6 w-6 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                {count} test cases imported
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{source}</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-sm text-emerald-700 underline hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
          >
            Import Again
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-6">
          <div className="flex items-center gap-3">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
          </div>
          <button
            onClick={handleReset}
            className="mt-3 text-sm text-red-700 underline hover:text-red-900 dark:text-red-300 dark:hover:text-red-100"
          >
            Try Again
          </button>
        </div>
      )}
    </section>
  );
}
