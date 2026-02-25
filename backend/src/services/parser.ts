import * as XLSX from "xlsx";

const DESCRIPTION_HEADERS = ["description", "title", "name", "test case", "test_case", "testcase"];

/**
 * Detect which column contains the test case descriptions.
 * Checks headers case-insensitively against a known list.
 */
function findDescriptionColumn(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const normalized = headers[i].trim().toLowerCase();
    if (DESCRIPTION_HEADERS.includes(normalized)) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse a CSV or XLSX file and extract test case description strings.
 * Returns a flat array of non-empty description strings.
 */
export function parseFile(filePath: string): string[] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("File contains no sheets");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rows.length < 2) {
    throw new Error("File must contain a header row and at least one data row");
  }

  const headers = rows[0].map((h) => String(h));
  const colIndex = findDescriptionColumn(headers);

  if (colIndex === -1) {
    throw new Error(
      `Could not find a description column. Expected one of: ${DESCRIPTION_HEADERS.join(", ")}. ` +
        `Found headers: ${headers.join(", ")}`
    );
  }

  const descriptions: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const value = rows[i][colIndex];
    if (value !== undefined && value !== null) {
      const text = String(value).trim();
      if (text.length > 0) {
        descriptions.push(text);
      }
    }
  }

  if (descriptions.length === 0) {
    throw new Error("No test case descriptions found in the file");
  }

  return descriptions;
}
