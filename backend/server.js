import "dotenv/config";
import express from "express";
import cors from "cors";

import { initDatabase } from "./initDatabase.js";
import { startDatabaseListener } from "./events.js";

import authRoutes from "./routes/auth.routes.js";
import componentsRoutes from "./routes/components.routes.js";
import systemsRoutes from "./routes/systems.routes.js";
import usersRoutes from "./routes/users.routes.js";
import documentsRoutes from "./routes/documents.routes.js";
import statusRoutes from "./routes/status.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import eventsRoutes from "./routes/events.routes.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/components", componentsRoutes);
app.use("/api/systems", systemsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api", documentsRoutes);
app.use("/api", statusRoutes);
app.use("/api", auditRoutes);
app.use("/api", eventsRoutes);

initDatabase()
  .then(async () => {
    await startDatabaseListener();

    app.listen(PORT, () => {
      console.log(`Engine Components API running on http://localhost:${PORT}`);
    });
  });