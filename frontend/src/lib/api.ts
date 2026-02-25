import { UploadResponse, SearchResponse } from "../types";

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

export async function checkHealth(): Promise<{
  status: string;
  timestamp: string;
}> {
  const res = await fetch("/api/health");
  return res.json();
}
