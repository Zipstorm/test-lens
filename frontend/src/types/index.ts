export interface SearchResult {
  testCase: string;
  relevance: "high" | "medium" | "low";
  riskScore: number;
  reason: string;
  issueKey?: string;
  testType?: string;
  folder?: string;
  steps?: string;
  preconditions?: string;
}

export interface UploadResponse {
  success: boolean;
  count: number;
}

export interface SearchResponse {
  userStory: string;
  jiraKey?: string;
  jiraSummary?: string;
  results: SearchResult[];
}

export interface JiraProject {
  key: string;
  name: string;
}

export interface JiraImportResponse {
  success: boolean;
  count: number;
  source: string;
}

export interface JiraIssuePreview {
  key: string;
  summary: string;
  description: string | null;
  searchText: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

export interface JiraTicketSummary {
  key: string;
  summary: string;
}

export interface SuggestedTestCase {
  title: string;
  steps: { action: string; expected: string }[];
  rationale: string;
}
