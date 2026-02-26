import Anthropic from "@anthropic-ai/sdk";
import type { MatchResult } from "./vectorStore";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;
const SUGGEST_MAX_TOKENS = 2048;

export interface ExplainResult {
  testCase: string;
  module?: string;
  source?: string;
  issueKey?: string;
  testType?: string;
  folder?: string;
  steps?: string;
  preconditions?: string;
  relevance: "high" | "medium" | "low";
  riskScore: number;
  reason: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Format steps JSON string into readable text for the prompt.
 */
function formatSteps(stepsJson: string): string {
  try {
    const steps = JSON.parse(stepsJson) as { action: string; data: string; result: string }[];
    return steps
      .map((s, i) => {
        const parts = [`Step ${i + 1}: ${s.action}`];
        if (s.data) parts.push(`Data: ${s.data}`);
        if (s.result) parts.push(`Expected: ${s.result}`);
        return parts.join(" | ");
      })
      .join("\n   ");
  } catch {
    return stepsJson;
  }
}

/**
 * Format preconditions JSON string into readable text for the prompt.
 */
function formatPreconditions(preJson: string): string {
  try {
    const pcs = JSON.parse(preJson) as { key: string; definition: string }[];
    return pcs.map((p) => `${p.key ? `[${p.key}] ` : ""}${p.definition}`).join("; ");
  } catch {
    return preJson;
  }
}

/**
 * Build the prompt that asks Claude to analyze test case relevance.
 * Uses structured metadata when available for richer context.
 */
function buildPrompt(
  userStory: string,
  matches: MatchResult[]
): string {
  const testCaseList = matches
    .map((m, i) => {
      const tags: string[] = [`score: ${m.score.toFixed(3)}`];
      if (m.module) tags.push(`module: ${m.module}`);
      if (m.testType) tags.push(`type: ${m.testType}`);
      if (m.issueKey) tags.push(`key: ${m.issueKey}`);

      const lines: string[] = [`${i + 1}. [${tags.join(", ")}]`];
      lines.push(`   Summary: ${m.text.split(". ")[0]}`);

      if (m.steps) {
        lines.push(`   Steps:\n   ${formatSteps(m.steps)}`);
      }
      if (m.preconditions) {
        lines.push(`   Preconditions: ${formatPreconditions(m.preconditions)}`);
      }
      if (m.gherkin) {
        lines.push(`   Gherkin: ${m.gherkin.slice(0, 300)}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");

  return `You are a QA engineer analyzing which regression test cases are relevant to a user story.

User Story:
"${userStory}"

Matched Test Cases (with similarity scores and structured details):
${testCaseList}

For each test case, determine:
- relevance: "high", "medium", or "low" based on how directly it relates to the user story
- riskScore: 1-5 (5 = highest risk if this test is skipped)
- reason: A brief explanation of why this test is or isn't relevant

Respond ONLY with a valid JSON array. No markdown, no explanation outside the JSON.
Each element must have: testCase (string), module (string or null), relevance ("high"|"medium"|"low"), riskScore (number 1-5), reason (string).`;
}

/**
 * Send matched test cases to Claude for relevance analysis.
 * Returns structured explanations for each test case.
 */
export async function explainMatches(
  userStory: string,
  matches: MatchResult[]
): Promise<ExplainResult[]> {
  if (matches.length === 0) return [];

  const prompt = buildPrompt(userStory, matches);

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const raw = textBlock.text.trim();

  // Strip markdown code fences if present
  const jsonStr = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

  const parsed: ExplainResult[] = JSON.parse(jsonStr);

  // Validate structure and enrich with metadata from original matches
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (
      typeof item.testCase !== "string" ||
      !["high", "medium", "low"].includes(item.relevance) ||
      typeof item.riskScore !== "number" ||
      item.riskScore < 1 ||
      item.riskScore > 5 ||
      typeof item.reason !== "string"
    ) {
      throw new Error("Invalid response structure from Claude");
    }
    // Attach metadata from the original Pinecone match
    if (i < matches.length) {
      const match = matches[i];
      // Always use the original summary as testCase (Claude may return the key instead)
      item.testCase = match.text.split(". ")[0];
      item.source = match.source;
      if (!item.module && match.module) {
        item.module = match.module;
      }
      item.issueKey = match.issueKey;
      item.testType = match.testType;
      item.folder = match.folder;
      item.steps = match.steps;
      item.preconditions = match.preconditions;
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Test case suggestion (gap analysis)
// ---------------------------------------------------------------------------

export interface SuggestedTestCase {
  title: string;
  steps: { action: string; expected: string }[];
  rationale: string;
}

/**
 * Ask Claude to suggest NEW test cases that are missing from the existing suite.
 * Analyzes the user story against existing tests and identifies coverage gaps.
 */
export async function suggestTestCases(
  userStory: string,
  existingTests: string[]
): Promise<SuggestedTestCase[]> {
  const existingList = existingTests
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n");

  const prompt = `You are an experienced QA engineer. A developer has written the following user story and the test suite already has these existing test cases.

User Story:
"${userStory}"

Existing Test Cases:
${existingList || "(none)"}

Analyze the user story and identify 3-5 NEW test cases that should be written but DO NOT already exist.
Focus on:
- Edge cases and error scenarios
- Security and permission boundaries
- Negative testing (invalid inputs, unauthorized access)
- Integration points and data validation
- Accessibility and UX edge cases

For each suggestion, provide:
- title: A clear, concise test case name
- steps: Array of { action, expected } pairs describing the test procedure
- rationale: Why this test is important and what gap it fills

Respond ONLY with a valid JSON array. No markdown, no explanation outside the JSON.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: SUGGEST_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const raw = textBlock.text.trim();
  const jsonStr = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

  const parsed: SuggestedTestCase[] = JSON.parse(jsonStr);

  // Basic validation
  for (const item of parsed) {
    if (
      typeof item.title !== "string" ||
      !Array.isArray(item.steps) ||
      typeof item.rationale !== "string"
    ) {
      throw new Error("Invalid suggestion structure from Claude");
    }
  }

  return parsed;
}
