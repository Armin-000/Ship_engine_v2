import "dotenv/config";
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "data", "components.json");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const raw = fs.readFileSync(DATA_FILE, "utf-8");
const components = JSON.parse(raw);

for (const [key, component] of Object.entries(components)) {
  const sfiaId = component.sfiaId || key;
  const title = component.title || key;
  const description =
    component.description || "No description available for this component yet.";

  const result = await db.query(
    `
    INSERT INTO components (sfia_id, title, description, updated_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    ON CONFLICT (sfia_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
    `,
    [sfiaId, title, description]
  );

  const componentId = result.rows[0].id;

  const docs = component.documents || {};

  for (const [type, fileUrl] of Object.entries(docs)) {
    if (!fileUrl) continue;

    await db.query(
      `
      DELETE FROM documents
      WHERE component_id = $1 AND type = $2
      `,
      [componentId, type]
    );

    await db.query(
      `
      INSERT INTO documents (component_id, type, file_url)
      VALUES ($1, $2, $3)
      `,
      [componentId, type, fileUrl]
    );
  }
}

console.log(`Imported ${Object.keys(components).length} components into PostgreSQL.`);

await db.end();