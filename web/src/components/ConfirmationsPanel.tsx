import { useEffect, useState } from "react";
import { api } from "../api";
import type { Confirmation } from "../types";

const REASON_LABEL: Record<string, string> = {
  irreversible: "不可逆",
  high_risk: "高リスク",
  value_judgment: "価値判断",
};

export function ConfirmationsPanel({ onResolved }: { onResolved?: () => void }) {
  const [items, setItems] = useState<Confirmation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const { confirmations } = await api.listConfirmations("pending");
    setItems(confirmations);
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, []);

  async function respond(id: string, result: "allow" | "deny") {
    setBusyId(id);
    try {
      await api.respondConfirmation(id, result);
      await refresh();
      onResolved?.();
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <>
      <p className="section-label">確認待ち（{items.length}）</p>
      {items.map((c) => (
        <div className="confirm-card" key={c.id}>
          <p className="confirm-summary">{c.proposed_action}</p>
          <div className="confirm-meta">
            {REASON_LABEL[c.reason] ?? c.reason}
            {c.risk_detail ? ` ・ ${c.risk_detail}` : ""}
          </div>
          <div className="confirm-actions">
            <button
              className="btn btn-primary"
              disabled={busyId === c.id}
              onClick={() => respond(c.id, "allow")}
              type="button"
            >
              承認する
            </button>
            <button
              className="btn btn-ghost"
              disabled={busyId === c.id}
              onClick={() => respond(c.id, "deny")}
              type="button"
            >
              却下する
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
