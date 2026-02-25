import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { initIndex } from "./services/vectorStore";
import uploadRouter from "./routes/upload";
import searchRouter from "./routes/search";
import jiraRouter from "./routes/jira";

const PORT = process.env.PORT || 3000;

async function main() {
  // Initialize Pinecone connection before starting the server
  try {
    await initIndex();
  } catch (err) {
    console.error("[Server] Failed to initialize Pinecone:", err);
    process.exit(1);
  }

  const app = express();

  // Middleware
  app.use(express.json());

  // Serve frontend static files (when available)
  app.use(express.static(path.join(__dirname, "../../frontend")));

  // API routes
  app.use("/api/upload", uploadRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/jira", jiraRouter);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.listen(PORT, () => {
    console.log(`[Server] Test Lens backend running on http://localhost:${PORT}`);
  });
}

main();
