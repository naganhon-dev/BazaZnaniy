import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import * as xlsx from "xlsx";
import path from "path";
import pdfParse from "pdf-parse-fork";

const app = express();
const PORT = process.env.PORT || 3000;

// Set up Multer for handling file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

// API Routes FIRST
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", vercel: !!process.env.VERCEL });
});

app.post("/api/parse-file", upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const originalName = file.originalname;
    const ext = path.extname(originalName).toLowerCase();
    let extractedText = "";

    if (file.mimetype === "application/pdf" || ext === ".pdf") {
      const pdfData = await pdfParse(file.buffer);
      extractedText = pdfData.text;
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === ".docx"
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      extractedText = result.value;
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      ext === ".xlsx" ||
      file.mimetype === "text/csv" ||
      ext === ".csv"
    ) {
      const workbook = xlsx.read(file.buffer, { type: "buffer" });
      const textParts: string[] = [];
      workbook.SheetNames.forEach((sheetName: string) => {
        const sheet = workbook.Sheets[sheetName];
        const csvText = xlsx.utils.sheet_to_csv(sheet);
        textParts.push(`--- Sheet: ${sheetName} ---\n${csvText}`);
      });
      extractedText = textParts.join("\n\n");
    } else if (file.mimetype.startsWith("text/") || ext === ".txt" || ext === ".md") {
      extractedText = file.buffer.toString("utf-8");
    } else {
      return res.status(400).json({ error: `Unsupported file type: ${originalName}` });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({ error: `Could not extract text from document: ${originalName}` });
    }

    res.json({
      filename: originalName,
      text: extractedText.trim(),
    });
  } catch (error: any) {
    console.error("Parse file error:", error);
    next(error);
  }
});

// Global Error Handler for API
app.use("/api", (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("API error:", err);
  res.status(500).json({ error: err.message || 'Internal server error while parsing file' });
});

// Only start Vite / Static serving and listen if not running as a Vercel serverless function
if (!process.env.VERCEL) {
  async function startServer() {
    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      // Production serving
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
  startServer();
}

export default app;
