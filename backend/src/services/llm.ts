import Anthropic from "@anthropic-ai/sdk";
import type { MatchResult } from "./vectorStore";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

export interface ExplainResult {
  testCase: string;
  module?: string;
  source?: string;
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
 * Build the prompt that asks Claude to analyze test case relevance.
 */
function buildPrompt(
  userStory: string,
  matches: MatchResult[]
): string {
  const testCaseList = matches
    .map((m, i) => {
      const moduleTag = m.module ? ` [module: ${m.module}]` : "";
      return `${i + 1}. [score: ${m.score.toFixed(3)}]${moduleTag} ${m.text}`;
    })
    .join("\n");

  return `You are a QA engineer analyzing which regression test cases are relevant to a user story.

User Story:
"${userStory}"

Matched Test Cases (with similarity scores):
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
    // Attach source and module from the original Pinecone match
    if (i < matches.length) {
      item.source = matches[i].source;
      if (!item.module && matches[i].module) {
        item.module = matches[i].module;
      }
    }
  }

  return parsed;
}
