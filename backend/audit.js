import { db } from "./db.js";

export async function writeAuditLog(
  action,
  entityType = null,
  entityId = null,
  userId = null
) {
  await db.query(
    `
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
    VALUES ($1, $2, $3, $4)
    `,
    [userId, action, entityType, entityId]
  );
}