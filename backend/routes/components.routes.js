import express from "express";
import { db } from "../db.js";
import { requireRole } from "../auth.js";
import { writeAuditLog } from "../audit.js";
import { normalizeKey, titleFromKey } from "../utils.js";

const router = express.Router();

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

async function getDocumentsForComponent(sfiaId) {
  const result = await db.query(
    `SELECT type, file_url FROM documents WHERE sfia_id = $1`,
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
  const allCandidates = [key, ...candidates]
    .filter(Boolean)
    .map((v) => String(v).trim());

  const normalizedCandidates = allCandidates.map(normalizeKey);

  const directResult = await db.query(
    `SELECT * FROM components WHERE sfia_id = ANY($1)`,
    [allCandidates]
  );

  if (directResult.rows.length > 0) {
    return directResult.rows[0];
  }

  const aliasResult = await db.query(
    `
    SELECT c.*
    FROM component_aliases ca
    JOIN components c ON c.sfia_id = ca.sfia_id
    WHERE ca.alias = ANY($1)
    `,
    [allCandidates]
  );

  if (aliasResult.rows.length > 0) {
    return aliasResult.rows[0];
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

router.get("/", async (req, res) => {
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

router.get("/resolve", async (req, res) => {
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

router.get("/:key/relations", async (req, res) => {
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

router.get("/:key", async (req, res) => {
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

router.put("/:key", requireRole(["admin", "editor"]), async (req, res) => {
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

router.delete("/:key", requireRole(["admin"]), async (req, res) => {
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

export default router;