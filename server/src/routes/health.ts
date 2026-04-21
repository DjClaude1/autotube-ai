import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ ok: true, service: "autotube-ai", time: new Date().toISOString() });
});

export default router;
