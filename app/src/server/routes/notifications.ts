import { Router } from "express";
import { repo } from "../../lib/repo.js";

const router = Router();

router.get("/", (req, res) => {
  const unreadOnly = req.query.unread === "true";
  res.json({ notifications: repo.listNotifications(unreadOnly) });
});

router.post("/:id/read", (req, res) => {
  repo.markNotificationRead(req.params.id);
  res.status(204).end();
});

export default router;
