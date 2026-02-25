import * as XLSX from "xlsx";

const DESCRIPTION_HEADERS = ["description", "title", "name", "test case", "test_case", "testcase"];
const MODULE_HEADERS = ["module", "component", "area", "category", "feature"];

export interface TestCase {
  text: string;
  module?: string;
}

/**
 * Find the index of a column whose header matches one of the candidate names.
 */
function findColumn(headers: string[], candidates: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const normalized = headers[i].trim().toLowerCase();
    if (candidates.includes(normalized)) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse a CSV or XLSX file and extract test cases with description and optional module.
 * Returns an array of TestCase objects.
 */
export function parseFile(filePath: string): TestCase[] {
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
  const descCol = findColumn(headers, DESCRIPTION_HEADERS);
  const moduleCol = findColumn(headers, MODULE_HEADERS);

  if (descCol === -1) {
    throw new Error(
      `Could not find a description column. Expected one of: ${DESCRIPTION_HEADERS.join(", ")}. ` +
        `Found headers: ${headers.join(", ")}`
    );
  }

  const testCases: TestCase[] = [];

  for (let i = 1; i < rows.length; i++) {
    const descValue = rows[i][descCol];
    if (descValue !== undefined && descValue !== null) {
      const text = String(descValue).trim();
      if (text.length > 0) {
        const testCase: TestCase = { text };
        if (moduleCol !== -1) {
          const modValue = rows[i][moduleCol];
          if (modValue !== undefined && modValue !== null) {
            testCase.module = String(modValue).trim();
          }
        }
        testCases.push(testCase);
      }
    }
  }

  if (testCases.length === 0) {
    throw new Error("No test case descriptions found in the file");
  }

  return testCases;
}
