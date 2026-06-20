import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";

import { requireRole } from "../auth.js";
import { writeAuditLog } from "../audit.js";
import { safeFileName } from "../utils.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "..", "public", "docs", "components");

fs.mkdirSync(DOCS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DOCS_DIR);
  },
  filename: (req, file, cb) => {
    const safeName = safeFileName(file.originalname);
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }

    cb(null, true);
  },
});

router.post(
  "/upload/document",
  requireRole(["admin", "editor"]),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No file uploaded",
        });
      }

      const url = `/docs/components/${req.file.filename}`;

      await writeAuditLog(
        "Document uploaded",
        "document",
        req.file.filename,
        req.user?.id || null
      );

      res.json({
        success: true,
        filename: req.file.filename,
        url,
      });
    } catch (error) {
      res.status(500).json({
        error: "Upload error",
        details: error.message,
      });
    }
  }
);

export default router;