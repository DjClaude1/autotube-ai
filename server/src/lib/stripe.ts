import Stripe from "stripe";
import { env, parseCreditPacks } from "../env.js";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  typescript: true,
});

export const creditPacks = parseCreditPacks(env.STRIPE_CREDIT_PACKS);

export function findCreditPackByPriceId(priceId: string) {
  return creditPacks.find((p) => p.priceId === priceId);
}
