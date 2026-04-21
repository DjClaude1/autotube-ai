"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function CreditsBadge() {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getCredits()
      .then((r) => alive && setCredits(r.credits))
      .catch(() => alive && setCredits(null));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Link
      href="/dashboard/billing"
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-sm hover:bg-white/10"
    >
      <span className="h-2 w-2 rounded-full bg-brand-500" />
      <span>{credits === null ? "—" : credits} credits</span>
    </Link>
  );
}
