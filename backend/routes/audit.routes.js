import express from "express";
import { db } from "../db.js";
import { requireRole } from "../auth.js";

const router = express.Router();

router.get("/audit-logs", requireRole(["admin"]), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        audit_logs.id,
        audit_logs.user_id,
        users.username,
        users.role,
        audit_logs.action,
        audit_logs.entity_type,
        audit_logs.entity_id,
        audit_logs.created_at
      FROM audit_logs
      LEFT JOIN users ON audit_logs.user_id = users.id
      ORDER BY audit_logs.created_at DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

export default router;