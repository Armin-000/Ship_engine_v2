import express from "express";
import { db } from "../db.js";

const router = express.Router();

router.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    res.json({
      ok: true,
      service: "engine-components-api",
      database: "postgresql",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: "engine-components-api",
      database: "offline",
      error: error.message,
    });
  }
});

router.get("/status", async (req, res) => {
  try {
    const componentsResult = await db.query(`SELECT COUNT(*)::int AS count FROM components`);
    const systemsResult = await db.query(`SELECT COUNT(*)::int AS count FROM systems`);
    const usersResult = await db.query(`SELECT COUNT(*)::int AS count FROM users`);
    const auditResult = await db.query(`SELECT COUNT(*)::int AS count FROM audit_logs`);

    const documentsResult = await db.query(`
      SELECT COUNT(DISTINCT file_url)::int AS count
      FROM documents
      WHERE file_url IS NOT NULL
    `);

    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    res.json({
      online: true,
      service: "engine-components-api",
      database: "postgresql",
      systemsReady: 13,
      components: componentsResult.rows[0].count,
      pdfDocuments: documentsResult.rows[0].count,
      systems: systemsResult.rows[0].count,
      users: usersResult.rows[0].count,
      auditLogs: auditResult.rows[0].count,
      uptime: {
        seconds: uptimeSeconds,
        text: `${hours}h ${minutes}m`,
      },
      build: "2026.06.13",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      online: false,
      database: "offline",
      error: error.message,
    });
  }
});

export default router;