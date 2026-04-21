import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      email?: string | null;
      accessToken: string;
    };
  }
}

/**
 * Verify a Supabase JWT on the `Authorization: Bearer <token>` header and
 * attach `req.user`. Use on any route that must belong to the caller.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization") ?? req.header("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }
  const accessToken = header.slice(7).trim();
  if (!accessToken) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  req.user = {
    id: data.user.id,
    email: data.user.email,
    accessToken,
  };
  next();
}
