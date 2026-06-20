import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth, signUserToken } from "../auth.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const result = await db.query(
      `SELECT id, username, role, password_hash FROM users WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(401).json({ error: "Password is not set for this user" });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = signUserToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Login error", details: error.message });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

export default router;