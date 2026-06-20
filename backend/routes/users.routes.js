import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireRole } from "../auth.js";
import { writeAuditLog } from "../audit.js";

const router = express.Router();

router.get("/", requireRole(["admin"]), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, username, role, created_at
      FROM users
      ORDER BY id ASC
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

router.put("/:username/password", requireRole(["admin"]), async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.username);
    const { password } = req.body || {};

    if (!password || password.length < 4) {
      return res.status(400).json({
        error: "Password must be at least 4 characters long",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE username = $2
      RETURNING id, username, role
      `,
      [passwordHash, username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    await writeAuditLog(
      "User password changed",
      "user",
      username,
      req.user?.id || null
    );

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      error: "Password update error",
      details: error.message,
    });
  }
});

router.put("/:username", requireRole(["admin"]), async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.username);
    const body = req.body || {};
    const role = body.role || "viewer";

    const allowedRoles = ["admin", "editor", "viewer"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        error: "Invalid role",
        allowedRoles,
      });
    }

    const result = await db.query(
      `
      INSERT INTO users (username, role)
      VALUES ($1, $2)
      ON CONFLICT (username)
      DO UPDATE SET role = EXCLUDED.role
      RETURNING id, username, role, created_at
      `,
      [username, role]
    );

    await writeAuditLog(
      "User upserted",
      "user",
      username,
      req.user?.id || null
    );

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

router.delete("/:username", requireRole(["admin"]), async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.username);

    const result = await db.query(
      `
      DELETE FROM users
      WHERE username = $1
      RETURNING id, username, role
      `,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
        username,
      });
    }

    await writeAuditLog(
      "User deleted",
      "user",
      username,
      req.user?.id || null
    );

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

export default router;