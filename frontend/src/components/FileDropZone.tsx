"use client";

import { useRef, useState, useCallback } from "react";

interface FileDropZoneProps {
  onFileSelected: (file: File) => void;
  accept: string;
  disabled?: boolean;
}

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

export default function FileDropZone({
  onFileSelected,
  accept,
  disabled = false,
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback(
    (file: File) => {
      const ext = file.name
        .substring(file.name.lastIndexOf("."))
        .toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setValidationError(
          `Invalid file type "${ext}". Accepted: ${ALLOWED_EXTENSIONS.join(", ")}`
        );
        return;
      }
      setValidationError(null);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) validateAndSelect(file);
    },
    [disabled, validateAndSelect]
  );

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSelect(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors
          ${disabled ? "cursor-not-allowed opacity-50" : ""}
          ${isDragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-950" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-slate-500 dark:hover:bg-slate-800"}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
        <svg
          className="mx-auto mb-3 h-10 w-10 text-slate-400 dark:text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Drag & drop your test file here, or{" "}
          <span className="text-blue-600 underline dark:text-blue-400">browse</span>
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          CSV, XLSX, or XLS (max 10MB)
        </p>
      </div>
      {validationError && (
        <p className="mt-2 text-sm text-red-600">{validationError}</p>
      )}
    </div>
  );
}
