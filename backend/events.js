import { dbEvents } from "./db.js";

const sseClients = new Set();

export function sendSseEvent(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;

  for (const res of sseClients) {
    res.write(data);
  }
}

export function registerSseClient(res) {
  sseClients.add(res);
}

export function unregisterSseClient(res) {
  sseClients.delete(res);
}

export async function startDatabaseListener() {
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