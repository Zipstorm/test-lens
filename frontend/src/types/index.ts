export interface SearchResult {
  testCase: string;
  relevance: "high" | "medium" | "low";
  riskScore: number;
  reason: string;
}

export interface UploadResponse {
  success: boolean;
  count: number;
}

export interface SearchResponse {
  userStory: string;
  results: SearchResult[];
}
