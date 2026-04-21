import express, { Router } from "express";
import type Stripe from "stripe";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabase.js";

const router = Router();

/**
 * Stripe webhooks must be mounted BEFORE the global JSON body parser so that
 * the raw body is available for signature verification.
 */
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.header("stripe-signature") ?? "";
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn({ err }, "stripe signature verification failed");
      res.status(400).send(`Webhook Error: ${(err as Error).message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event);
          break;
        case "payment_intent.succeeded":
          // Usually redundant with checkout.session.completed but harmless
          // due to idempotency on stripe_event_id.
          break;
        default:
          logger.debug({ type: event.type }, "ignoring stripe event");
      }
      res.json({ received: true });
    } catch (err) {
      logger.error({ err, type: event.type }, "stripe handler failed");
      res.status(500).json({ error: "handler_failed" });
    }
  },
);

async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    logger.info({ sessionId: session.id, status: session.payment_status }, "checkout not paid");
    return;
  }
  const userId = session.metadata?.supabase_user_id;
  const creditsRaw = session.metadata?.credits;
  const credits = Number(creditsRaw);
  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    logger.warn(
      { sessionId: session.id, metadata: session.metadata },
      "checkout.session.completed missing metadata; cannot credit user",
    );
    return;
  }

  const { error } = await supabaseAdmin.rpc("add_credits", {
    p_user_id: userId,
    p_amount: credits,
    p_stripe_event_id: event.id,
    p_metadata: {
      session_id: session.id,
      price_id: session.metadata?.price_id,
      amount_total: session.amount_total,
      currency: session.currency,
    },
  });
  if (error) throw new Error(`add_credits: ${error.message}`);
  logger.info({ userId, credits, eventId: event.id }, "credited user from stripe");
}

export default router;
