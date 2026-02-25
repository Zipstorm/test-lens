import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { parseFile } from "../services/parser";
import { embedBatch } from "../services/embedder";
import { buildIndex } from "../services/vectorStore";

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    // 1. Parse test cases from file (now returns TestCase objects with module)
    const testCases = parseFile(file.path);
    console.log(`[Upload] Parsed ${testCases.length} test cases`);

    // 2. Generate embeddings in a single batch call (embed only the text)
    const texts = testCases.map((tc) => tc.text);
    const vectors = await embedBatch(texts);
    console.log(`[Upload] Generated ${vectors.length} embeddings`);

    // 3. Upsert into Pinecone (with module metadata)
    await buildIndex(vectors, testCases);
    console.log(`[Upload] Indexed ${vectors.length} vectors in Pinecone`);

    res.json({ success: true, count: testCases.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during upload processing";
    console.error(`[Upload] Error: ${message}`);
    res.status(400).json({ error: message });
  } finally {
    // Clean up temp file
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
});

export default router;
