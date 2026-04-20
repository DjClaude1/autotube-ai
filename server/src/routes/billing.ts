import { Router } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { stripe, creditPacks, findCreditPackByPriceId } from "../lib/stripe.js";
import { requireUser } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";

const router = Router();

const bodySchema = z.object({
  price_id: z.string().min(1),
});

router.get("/packs", (_req, res) => {
  res.json({ packs: creditPacks });
});

router.post("/checkout", requireUser, async (req, res, next) => {
  try {
    const { price_id } = bodySchema.parse(req.body);
    const user = req.user!;
    const pack = findCreditPackByPriceId(price_id);
    if (!pack) throw new HttpError(400, "invalid_price", "Unknown credit pack.");

    // Fetch or create Stripe customer for this user.
    const profile = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .maybeSingle();
    if (profile.error) throw new HttpError(500, "db_query_failed", profile.error.message);

    let customerId = profile.data?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: pack.priceId, quantity: 1 }],
      success_url: `${env.WEB_URL}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.WEB_URL}/dashboard/billing?status=canceled`,
      metadata: {
        supabase_user_id: user.id,
        credits: String(pack.credits),
        price_id: pack.priceId,
      },
      payment_intent_data: {
        metadata: {
          supabase_user_id: user.id,
          credits: String(pack.credits),
          price_id: pack.priceId,
        },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

export default router;
