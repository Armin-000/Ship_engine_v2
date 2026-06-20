import { db } from "./db.js";

export async function initDatabase() {
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