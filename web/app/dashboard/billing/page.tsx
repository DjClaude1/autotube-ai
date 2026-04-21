"use client";

import { useEffect, useState } from "react";
import { api, type CreditPack, type CreditsResponse } from "@/lib/api";

export default function BillingPage() {
  const [packs, setPacks] = useState<CreditPack[] | null>(null);
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPack, setBusyPack] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listPacks(), api.getCredits()])
      .then(([p, c]) => {
        setPacks(p.packs);
        setCredits(c);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  async function buy(priceId: string) {
    setBusyPack(priceId);
    setError(null);
    try {
      const res = await api.checkout(priceId);
      window.location.href = res.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyPack(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-2 text-slate-400">
          Each video costs 1 credit. Top up below — payments are processed by Stripe.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="text-sm text-slate-400">Current balance</div>
        <div className="mt-1 text-4xl font-bold">
          {credits ? credits.credits : "—"}
          <span className="ml-2 text-base font-normal text-slate-400">credits</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!packs ? (
        <p className="text-slate-400">Loading packs…</p>
      ) : packs.length === 0 ? (
        <p className="text-slate-400">
          No credit packs configured yet. Set <code>STRIPE_CREDIT_PACKS</code> on the server to
          expose them here.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((p) => (
            <div
              key={p.priceId}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="text-3xl font-bold">{p.credits}</div>
              <div className="text-slate-400">credits</div>
              <button
                type="button"
                onClick={() => buy(p.priceId)}
                disabled={busyPack === p.priceId}
                className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2 font-medium hover:bg-brand-500 disabled:opacity-50"
              >
                {busyPack === p.priceId ? "Redirecting…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
      )}

      {credits && credits.history.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <ul className="mt-3 divide-y divide-white/5 text-sm">
            {credits.history.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{h.reason}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(h.created_at).toLocaleString()}
                  </div>
                </div>
                <div className={h.delta > 0 ? "text-emerald-400" : "text-slate-300"}>
                  {h.delta > 0 ? `+${h.delta}` : h.delta}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
