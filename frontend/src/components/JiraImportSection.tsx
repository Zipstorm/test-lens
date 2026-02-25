"use client";

import { useState, useEffect } from "react";
import {
  fetchJiraProjects,
  fetchIssueTypes,
  fetchTicketsByType,
  importFromJira,
  importFromXray,
} from "../lib/api";
import type { JiraProject, JiraIssueType, JiraTicketSummary } from "../types";

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

  // Load issue types when project changes
  useEffect(() => {
    if (!selectedProject || status !== "ready") return;
    setSelectedIssueType("");
    setTickets([]);
    setSelectedTicket("");
    setLoadingIssueTypes(true);
    fetchIssueTypes(selectedProject)
      .then((types) => setIssueTypes(types))
      .catch((err) => console.error("Failed to load issue types:", err))
      .finally(() => setLoadingIssueTypes(false));
  }, [selectedProject, status]);

  // Load tickets when issue type changes
  useEffect(() => {
    if (!selectedIssueType || !selectedProject) {
      setTickets([]);
      setSelectedTicket("");
      return;
    }
    setLoadingTickets(true);
    setSelectedTicket("");
    fetchTicketsByType(selectedProject, selectedIssueType)
      .then((t) => setTickets(t))
      .catch((err) => console.error("Failed to load tickets:", err))
      .finally(() => setLoadingTickets(false));
  }, [selectedIssueType, selectedProject]);

  const loadProjects = async () => {
    setStatus("loading-projects");
    setError("");
    try {
      const data = await fetchJiraProjects();
      setProjects(data);
      const qa = data.find((p) => p.key === "QA");
      setSelectedProject(qa ? qa.key : data[0]?.key ?? "");
      setStatus("ready");
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
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
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
          <p className="mb-1 text-sm font-medium text-slate-700">
            Connect to Jira
          </p>
          <p className="mb-4 text-xs text-slate-400">
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
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-6">
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
          <p className="text-sm text-slate-600">Loading Jira projects...</p>
        </div>
      )}

      {status === "ready" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label
                htmlFor="jira-project"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Project
              </label>
              <select
                id="jira-project"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
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
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Max issues
              </label>
              <select
                id="max-results"
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
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
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Filter by parent ticket{" "}
              <span className="text-xs text-slate-400">(optional)</span>
            </label>
            {loadingIssueTypes ? (
              <p className="text-xs text-slate-400">Loading issue types...</p>
            ) : (
              <select
                id="issue-type"
                value={selectedIssueType}
                onChange={(e) => setSelectedIssueType(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
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
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Select {selectedIssueType}
              </label>
              {loadingTickets ? (
                <p className="text-xs text-slate-400">
                  Loading {selectedIssueType} tickets...
                </p>
              ) : tickets.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No {selectedIssueType} tickets found in this project.
                </p>
              ) : (
                <select
                  id="parent-ticket"
                  value={selectedTicket}
                  onChange={(e) => setSelectedTicket(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
                >
                  <option value="">-- Select a ticket --</option>
                  {tickets.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.key} — {t.summary}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Import mode toggle */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Import source
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setImportMode("xray")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  importMode === "xray"
                    ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                Xray (with steps)
              </button>
              <button
                onClick={() => setImportMode("jira")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  importMode === "jira"
                    ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                Jira (summary only)
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
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
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-6">
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
              Importing from {selectedTicket || selectedProject} via{" "}
              {importMode === "xray" ? "Xray" : "Jira"}...
            </p>
            <p className="text-xs text-slate-400">
              {importMode === "xray"
                ? "Fetching tests with steps & preconditions, embedding, and indexing."
                : "Fetching issues, embedding, and indexing."}{" "}
              This may take a moment.
            </p>
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-6">
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
              <p className="text-sm font-medium text-emerald-800">
                {count} test cases imported
              </p>
              <p className="text-xs text-emerald-600">{source}</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-sm text-emerald-700 underline hover:text-emerald-900"
          >
            Import Again
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
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
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
          <button
            onClick={handleReset}
            className="mt-3 text-sm text-red-700 underline hover:text-red-900"
          >
            Try Again
          </button>
        </div>
      )}
    </section>
  );
}
