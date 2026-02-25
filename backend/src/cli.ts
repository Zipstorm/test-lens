import dotenv from "dotenv";
dotenv.config();

import readline from "readline";
import path from "path";
import { parseFile, enrichForEmbedding } from "./services/parser";
import { embedBatch, embed } from "./services/embedder";
import { initIndex, buildIndex, queryIndex, isIndexReady } from "./services/vectorStore";
import { explainMatches, type ExplainResult } from "./services/llm";

// ANSI colors
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const MAGENTA = "\x1b[35m";

const DEFAULT_FILE = path.join(__dirname, "../test-data/sample-tests.csv");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function printBanner() {
  console.log(`
${CYAN}${BOLD}╔══════════════════════════════════════╗
║          TEST LENS CLI               ║
║   AI-Powered Regression Test Selector║
╚══════════════════════════════════════╝${RESET}
`);
}

function printMenu() {
  console.log(`${BOLD}Choose an action:${RESET}`);
  console.log(`  ${GREEN}1)${RESET} upload  — Index test cases from a CSV/XLSX file`);
  console.log(`  ${GREEN}2)${RESET} search  — Find relevant tests for a user story`);
  console.log(`  ${GREEN}3)${RESET} exit    — Quit`);
  console.log();
}

function relevanceColor(relevance: string): string {
  switch (relevance) {
    case "high":
      return RED;
    case "medium":
      return YELLOW;
    case "low":
      return GREEN;
    default:
      return RESET;
  }
}

function riskBar(score: number): string {
  const filled = "█".repeat(score);
  const empty = "░".repeat(5 - score);
  const color = score >= 4 ? RED : score >= 3 ? YELLOW : GREEN;
  return `${color}${filled}${empty}${RESET} ${score}/5`;
}

function printResults(userStory: string, results: ExplainResult[]) {
  console.log();
  console.log(`${BOLD}${CYAN}── Results for: "${userStory}" ──${RESET}`);
  console.log();

  if (results.length === 0) {
    console.log(`${DIM}  No matching test cases found.${RESET}`);
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const color = relevanceColor(r.relevance);
    const moduleTag = r.module ? ` ${MAGENTA}[${r.module}]${RESET}` : "";
    const sourceTag = r.source ? ` ${DIM}← ${r.source}${RESET}` : "";
    console.log(`${BOLD}  ${i + 1}. ${r.testCase}${RESET}${moduleTag}${sourceTag}`);
    console.log(`     Relevance: ${color}${BOLD}${r.relevance.toUpperCase()}${RESET}`);
    console.log(`     Risk:      ${riskBar(r.riskScore)}`);
    console.log(`     Reason:    ${DIM}${r.reason}${RESET}`);
    console.log();
  }
}

async function handleUpload() {
  const input = await ask(
    `${BOLD}File path${RESET} ${DIM}(Enter for default: test-data/sample-tests.csv)${RESET}: `
  );
  const filePath = input.trim() || DEFAULT_FILE;

  console.log(`\n${DIM}Parsing file...${RESET}`);
  const testCases = parseFile(filePath);
  const moduleCount = testCases.filter((tc) => tc.module).length;
  console.log(`  Found ${BOLD}${testCases.length}${RESET} test cases` +
    (moduleCount > 0 ? ` (${moduleCount} with module info)` : ""));

  console.log(`${DIM}Generating embeddings (enriched with module context)...${RESET}`);
  const enrichedTexts = testCases.map(enrichForEmbedding);
  const vectors = await embedBatch(enrichedTexts);
  console.log(`  Generated ${BOLD}${vectors.length}${RESET} embeddings`);

  const source = path.basename(filePath);
  console.log(`${DIM}Indexing in Pinecone (source: ${source})...${RESET}`);
  await buildIndex(vectors, testCases, source);
  console.log(`  ${GREEN}${BOLD}✓ Indexed ${testCases.length} test cases successfully${RESET}`);
  console.log(`  ${DIM}Source tagged as: ${source}${RESET}\n`);
}

async function handleSearch() {
  if (!isIndexReady()) {
    console.log(`\n${RED}Index not ready. Upload a file first.${RESET}\n`);
    return;
  }

  const userStory = await ask(`${BOLD}Enter user story${RESET}: `);
  if (!userStory.trim()) {
    console.log(`${RED}User story cannot be empty.${RESET}\n`);
    return;
  }

  const topKInput = await ask(`${BOLD}Top K results${RESET} ${DIM}(Enter for 5)${RESET}: `);
  const topK = Math.min(Math.max(Number(topKInput) || 5, 1), 20);

  console.log(`\n${DIM}Embedding user story...${RESET}`);
  const queryVector = await embed(userStory.trim());

  console.log(`${DIM}Searching vector index...${RESET}`);
  const matches = await queryIndex(queryVector, topK);
  console.log(`  Found ${BOLD}${matches.length}${RESET} matches`);

  console.log(`${DIM}Asking Claude to analyze relevance...${RESET}`);
  const results = await explainMatches(userStory.trim(), matches);

  printResults(userStory.trim(), results);
}

async function main() {
  printBanner();

  console.log(`${DIM}Connecting to Pinecone...${RESET}`);
  try {
    await initIndex();
    console.log(`${GREEN}${BOLD}✓ Connected${RESET}\n`);
  } catch (err) {
    console.error(`${RED}Failed to connect to Pinecone:${RESET}`, err);
    process.exit(1);
  }

  while (true) {
    printMenu();
    const choice = await ask(`${BOLD}> ${RESET}`);

    switch (choice.trim().toLowerCase()) {
      case "1":
      case "upload":
        try {
          await handleUpload();
        } catch (err) {
          console.error(`\n${RED}Upload failed:${RESET}`, err instanceof Error ? err.message : err);
          console.log();
        }
        break;

      case "2":
      case "search":
        try {
          await handleSearch();
        } catch (err) {
          console.error(`\n${RED}Search failed:${RESET}`, err instanceof Error ? err.message : err);
          console.log();
        }
        break;

      case "3":
      case "exit":
      case "quit":
      case "q":
        console.log(`\n${DIM}Goodbye!${RESET}\n`);
        rl.close();
        process.exit(0);

      default:
        console.log(`${YELLOW}Unknown option. Pick 1, 2, or 3.${RESET}\n`);
    }
  }
}

main();
