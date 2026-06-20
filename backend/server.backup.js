import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import pg from "pg";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const DOCS_DIR = path.join(__dirname, "..", "public", "docs", "components");

fs.mkdirSync(DOCS_DIR, { recursive: true });

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const dbEvents = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const sseClients = new Set();

function sendSseEvent(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;

  for (const res of sseClients) {
    res.write(data);
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_later";

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use("/docs/components", express.static(DOCS_DIR));

async function startDatabaseListener() {
  const client = await dbEvents.connect();

  await client.query("LISTEN smeco_changes");

  client.on("notification", (msg) => {
    try {
      const payload = JSON.parse(msg.payload);

      sendSseEvent({
        type: "database_change",
        ...payload,
      });
    } catch {
      sendSseEvent({
        type: "database_change",
        table: "unknown",
        operation: "unknown",
        changed_at: new Date().toISOString(),
      });
    }
  });

  console.log("Listening for PostgreSQL changes on smeco_changes.");
}

async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS components (
      id SERIAL PRIMARY KEY,
      sfia_id VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(255),
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      sfia_id VARCHAR(255),
      type VARCHAR(50),
      file_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS sfia_id VARCHAR(255);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS systems (
      id SERIAL PRIMARY KEY,
      sfia_id VARCHAR(255) UNIQUE,
      title VARCHAR(255),
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE,
      role VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT,
      entity_type VARCHAR(100),
      entity_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function normalizeKey(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-./\\]+/g, " ")
    .replace(/[^\w\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromKey(key = "") {
  return (
    String(key || "Component")
      .replace(/^path:/, "")
      .replace(/^name:/, "")
      .replace(/^uuid:/, "")
      .split("/")
      .pop()
      .replace(/_/g, " ")
      .trim() || "Component"
  );
}

function makeDefaultComponent(key) {
  return {
    key,
    sfiaId: key,
    title: titleFromKey(key),
    description: "No description available for this component yet.",
    documents: {
      documentation: null,
      schematics: null,
      maintenance: null,
    },
    source: "default",
  };
}

function safeFileName(name = "") {
  return String(name || "document.pdf")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

async function writeAuditLog(action, entityType = null, entityId = null, userId = null) {
  await db.query(
    `
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
    VALUES ($1, $2, $3, $4)
    `,
    [userId, action, entityType, entityId]
  );
}

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing token",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid token",
    });
  }
}

function requireRole(allowedRoles = []) {
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
          return res.status(403).json({
            error: "User not found",
          });
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
      res.status(500).json({
        error: error.message,
      });
    }
  };
}

async function getDocumentsForComponent(sfiaId) {
  const result = await db.query(
    `
    SELECT type, file_url
    FROM documents
    WHERE sfia_id = $1
    `,
    [sfiaId]
  );

  const documents = {
    documentation: null,
    schematics: null,
    maintenance: null,
  };

  result.rows.forEach((row) => {
    if (row.type in documents) {
      documents[row.type] = row.file_url;
    }
  });

  return documents;
}

async function findComponentByKey(key, candidates = []) {
  const allCandidates = [key, ...candidates].filter(Boolean);
  const normalizedCandidates = allCandidates.map(normalizeKey);

  const result = await db.query(
    `
    SELECT *
    FROM components
    WHERE sfia_id = ANY($1)
    `,
    [allCandidates]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  const allComponents = await db.query(`SELECT * FROM components`);

  return (
    allComponents.rows.find((component) => {
      const normalizedSfia = normalizeKey(component.sfia_id);
      const normalizedTitle = normalizeKey(component.title);

      return (
        normalizedCandidates.includes(normalizedSfia) ||
        normalizedCandidates.includes(normalizedTitle)
      );
    }) || null
  );
}

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

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    const result = await db.query(
      `
      SELECT id, username, role, password_hash
      FROM users
      WHERE username = $1
      `,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(401).json({
        error: "Password is not set for this user",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

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
    res.status(500).json({
      error: "Login error",
      details: error.message,
    });
  }
});

app.put(
  "/api/users/:username/password",
  requireRole(["admin"]),
  async (req, res) => {
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
  }
);

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

app.get("/api/health", async (req, res) => {
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

app.get("/api/status", async (req, res) => {
  try {
    const componentsResult = await db.query(`
      SELECT COUNT(*)::int AS count FROM components
    `);

    const documentsResult = await db.query(`
      SELECT COUNT(DISTINCT file_url)::int AS count
      FROM documents
      WHERE file_url IS NOT NULL
    `);

    const systemsResult = await db.query(`
      SELECT COUNT(*)::int AS count FROM systems
    `);

    const usersResult = await db.query(`
      SELECT COUNT(*)::int AS count FROM users
    `);

    const auditResult = await db.query(`
      SELECT COUNT(*)::int AS count FROM audit_logs
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

app.get("/api/components", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM components
      ORDER BY id ASC
    `);

    const response = {};

    for (const component of result.rows) {
      const documents = await getDocumentsForComponent(component.sfia_id);

      response[component.sfia_id] = {
        title: component.title,
        description: component.description,
        sfiaId: component.sfia_id,
        documents,
        updatedAt: component.updated_at,
      };
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

app.get("/api/components/resolve", async (req, res) => {
  try {
    const key = req.query.key || "";

    const candidates = req.query.candidate
      ? Array.isArray(req.query.candidate)
        ? req.query.candidate
        : [req.query.candidate]
      : [];

    const component = await findComponentByKey(key, candidates);

    if (!component) {
      return res.json(makeDefaultComponent(key));
    }

    const documents = await getDocumentsForComponent(component.sfia_id);

    res.json({
      key: component.sfia_id,
      sfiaId: component.sfia_id,
      title: component.title,
      description: component.description,
      documents,
      source: "postgresql",
    });
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

app.get("/api/components/:key", async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const component = await findComponentByKey(key);

    if (!component) {
      return res.json(makeDefaultComponent(key));
    }

    const documents = await getDocumentsForComponent(component.sfia_id);

    res.json({
      key: component.sfia_id,
      sfiaId: component.sfia_id,
      title: component.title,
      description: component.description,
      documents,
      source: "postgresql",
    });
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

app.get("/api/components/:key/relations", async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);

    const result = await db.query(
      `
      SELECT
        cr.source_sfia_id,
        source.title AS source_title,
        cr.relation_type,
        cr.target_sfia_id,
        target.title AS target_title,
        cr.created_at
      FROM component_relations cr
      LEFT JOIN components source ON source.sfia_id = cr.source_sfia_id
      LEFT JOIN components target ON target.sfia_id = cr.target_sfia_id
      WHERE cr.source_sfia_id = $1
         OR cr.target_sfia_id = $1
      ORDER BY cr.created_at DESC
      `,
      [key]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch component relations",
      details: err.message,
    });
  }
});

app.put(
  "/api/components/:key",
  requireRole(["admin", "editor"]),
  async (req, res) => {

  try {
    const key = decodeURIComponent(req.params.key);
    const body = req.body || {};

    const sfiaId = body.sfiaId || key;
    const title = body.title || titleFromKey(sfiaId);
    const description = body.description || "No description available.";

    const componentResult = await db.query(
      `
      INSERT INTO components (sfia_id, title, description, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (sfia_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [sfiaId, title, description]
    );

    const component = componentResult.rows[0];

    const documents = {
      documentation: body.documents?.documentation || null,
      schematics: body.documents?.schematics || null,
      maintenance: body.documents?.maintenance || null,
    };

    for (const [type, fileUrl] of Object.entries(documents)) {

      await db.query(
        `
        DELETE FROM documents
        WHERE sfia_id = $1 AND type = $2
        `,
        [component.sfia_id, type]
      );

      if (fileUrl) {
        await db.query(
          `
          INSERT INTO documents (sfia_id, type, file_url)
          VALUES ($1, $2, $3)
          `,
          [component.sfia_id, type, fileUrl]
        );
      }
    }

    await writeAuditLog(
      "Component updated",
      "component",
      component.sfia_id,
      req.user?.id || null
    );

    res.json({
      success: true,
      key: component.sfia_id,
      component: {
        title: component.title,
        description: component.description,
        sfiaId: component.sfia_id,
        documents,
        updatedAt: component.updated_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

app.post(
  "/api/upload/document",
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
});

app.delete(
  "/api/components/:key",
  requireRole(["admin"]),
  async (req, res) => {

  try {
    const key = decodeURIComponent(req.params.key);

    const result = await db.query(
      `
      DELETE FROM components
      WHERE sfia_id = $1
      RETURNING *
      `,
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Component not found",
        key,
      });
    }

    await writeAuditLog(
      "Component deleted",
      "component",
      key,
      req.user?.id || null
    );

    res.json({
      success: true,
      key,
    });
  } catch (error) {
    res.status(500).json({
      error: "Database error",
      details: error.message,
    });
  }
});

app.get("/api/systems", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM systems
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

app.put(
  "/api/systems/:sfiaId",
  requireRole(["admin", "editor"]),
  async (req, res) => {

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

app.get(
  "/api/audit-logs",
  requireRole(["admin"]),
  async (req, res) => {

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

app.get(
  "/api/users",
  requireRole(["admin"]),
  async (req, res) => {

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

app.put(
  "/api/users/:username",
  requireRole(["admin"]),
  async (req, res) => {
    
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

app.delete(
  "/api/users/:username",
  requireRole(["admin"]),
  async (req, res) => {

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

app.use((err, req, res, next) => {
  res.status(400).json({
    error: err.message || "Server error",
  });
});

initDatabase()
  .then(async () => {
    await startDatabaseListener();

    app.listen(PORT, () => {
      console.log(`Engine Components API running on http://localhost:${PORT}`);
      console.log("Database tables are ready.");
    });
  })
  
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });