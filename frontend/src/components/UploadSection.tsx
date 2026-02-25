"use client";

import { useState } from "react";
import FileDropZone from "./FileDropZone";
import { uploadFile } from "../lib/api";

interface UploadSectionProps {
  onUploadComplete: (count: number) => void;
}

type UploadStatus = "idle" | "uploading" | "success" | "error";

export default function UploadSection({
  onUploadComplete,
}: UploadSectionProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [count, setCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const handleFileSelected = async (file: File) => {
    setStatus("uploading");
    setFileName(file.name);
    setError("");

    try {
      const res = await uploadFile(file);
      setCount(res.count);
      setStatus("success");
      onUploadComplete(res.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setCount(0);
    setFileName("");
    setError("");
  };

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Upload Test Cases
      </h2>

      {status === "idle" && (
        <FileDropZone
          onFileSelected={handleFileSelected}
          accept=".csv,.xlsx,.xls"
        />
      )}

      {status === "uploading" && (
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
              Processing {fileName}...
            </p>
            <p className="text-xs text-slate-400">
              Parsing, embedding, and indexing test cases. This may take a
              moment.
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
                {count} test cases indexed successfully
              </p>
              <p className="text-xs text-emerald-600">{fileName}</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-sm text-emerald-700 underline hover:text-emerald-900"
          >
            Upload Another
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
            <div>
              <p className="text-sm font-medium text-red-800">{error}</p>
              <p className="text-xs text-red-600">{fileName}</p>
            </div>
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
