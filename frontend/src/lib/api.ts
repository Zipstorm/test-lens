import {
  UploadResponse,
  SearchResponse,
  JiraProject,
  JiraImportResponse,
  JiraIssuePreview,
  JiraIssueType,
  JiraTicketSummary,
  SuggestedTestCase,
  IndexStats,
  CoverageData,
} from "../types";

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Upload failed");
  }

  return res.json();
}

export async function searchTestCases(
  userStory: string,
  topK: number = 5
): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userStory, topK }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Search failed");
  }

  return res.json();
}

export async function searchByJiraKey(
  jiraKey: string,
  topK: number = 5
): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jiraKey, topK }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Jira search failed");
  }

  return res.json();
}

export async function fetchJiraProjects(): Promise<JiraProject[]> {
  const res = await fetch("/api/jira/projects");

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch Jira projects");
  }

  const data = await res.json();
  return data.projects;
}

export async function fetchIssueTypes(
  projectKey: string
): Promise<JiraIssueType[]> {
  const res = await fetch(
    `/api/jira/projects/${encodeURIComponent(projectKey)}/issue-types`
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch issue types");
  }

  const data = await res.json();
  return data.issueTypes;
}

export async function fetchTicketsByType(
  projectKey: string,
  issueType: string,
  maxResults: number = 50
): Promise<JiraTicketSummary[]> {
  const params = new URLSearchParams({
    issueType,
    maxResults: String(maxResults),
  });
  const res = await fetch(
    `/api/jira/projects/${encodeURIComponent(projectKey)}/tickets?${params}`
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch tickets");
  }

  const data = await res.json();
  return data.tickets;
}

export async function importFromJira(
  projectKey: string,
  maxResults: number = 100,
  parentTicketKey?: string
): Promise<JiraImportResponse> {
  const res = await fetch("/api/jira/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectKey, maxResults, parentTicketKey }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Jira import failed");
  }

  return res.json();
}

export async function importFromXray(
  projectKey: string,
  maxResults: number = 100,
  parentTicketKey?: string
): Promise<JiraImportResponse> {
  const res = await fetch("/api/jira/xray-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectKey, maxResults, parentTicketKey }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Xray import failed");
  }

  return res.json();
}

export async function fetchJiraIssue(issueKey: string): Promise<JiraIssuePreview> {
  const res = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch Jira issue");
  }

  return res.json();
}

export async function suggestTestCases(
  userStory: string,
  existingTests: string[]
): Promise<SuggestedTestCase[]> {
  const res = await fetch("/api/search/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userStory, existingTests }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Suggestion failed");
  }

  const data = await res.json();
  return data.suggestions;
}

export async function fetchIndexStats(): Promise<IndexStats> {
  const res = await fetch("/api/stats");

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch index stats");
  }

  return res.json();
}

export async function fetchCoverage(): Promise<CoverageData> {
  const res = await fetch("/api/stats/coverage");

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch coverage data");
  }

  return res.json();
}

export async function checkHealth(): Promise<{
  status: string;
  timestamp: string;
}> {
  const res = await fetch("/api/health");
  return res.json();
}
