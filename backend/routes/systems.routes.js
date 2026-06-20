import express from "express";
import { db } from "../db.js";
import { requireRole } from "../auth.js";
import { writeAuditLog } from "../audit.js";
import { titleFromKey } from "../utils.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM systems
      ORDER BY id ASC
    `);

    const systems = [];

    for (const system of result.rows) {
      const docsResult = await db.query(
        `SELECT type, file_url FROM documents WHERE sfia_id = $1`,
        [system.sfia_id]
      );

      const documents = {
        documentation: null,
        schematics: null,
        maintenance: null,
      };

      docsResult.rows.forEach((row) => {
        if (row.type in documents) {
          documents[row.type] = row.file_url;
        }
      });

      systems.push({
        ...system,
        documents,
      });
    }

    res.json(systems);
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

router.put("/:sfiaId", requireRole(["admin", "editor"]), async (req, res) => {
  try {
    const sfiaId = decodeURIComponent(req.params.sfiaId);
    const body = req.body || {};

    const result = await db.query(
      `
      INSERT INTO systems (sfia_id, title, description, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (sfia_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [
        sfiaId,
        body.title || titleFromKey(sfiaId),
        body.description || "No description available.",
      ]
    );

    await writeAuditLog(
      "System updated",
      "system",
      sfiaId,
      req.user?.id || null
    );

    res.json({
      success: true,
      system: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

export default router;