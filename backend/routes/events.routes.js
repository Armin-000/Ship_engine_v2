import express from "express";
import { registerSseClient, unregisterSseClient } from "../events.js";

const router = express.Router();

router.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  registerSseClient(res);

  req.on("close", () => {
    unregisterSseClient(res);
  });
});

export default router;