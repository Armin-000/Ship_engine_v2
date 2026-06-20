import jwt from "jsonwebtoken";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_later";

export function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      requireAuth(req, res, async () => {
        const result = await db.query(
          `
          SELECT id, username, role
          FROM users
          WHERE id = $1
          `,
          [req.user.id]
        );

        if (result.rows.length === 0) {
          return res.status(403).json({ error: "User not found" });
        }

        const user = result.rows[0];

        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({
            error: "Insufficient permissions",
            required: allowedRoles,
            currentRole: user.role,
          });
        }

        req.user = user;
        next();
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
}

export function signUserToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}