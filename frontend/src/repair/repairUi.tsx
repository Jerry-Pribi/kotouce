import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import type { RepairWheel, ReprofilingState } from "../types";

/** Stav zakázky slovy firmy (null = kotouč už je zpátky v AGC). */
export const JOB_LABELS: Record<ReprofilingState, string> = {
  ceka: "Ke převzetí",
  prevzato: "V práci",
  hotovo: "Hotovo – k odvozu",
  nelze: "Nelze reprofilovat",
};

export function stateLabel(state: ReprofilingState | null) {
  return state ? JOB_LABELS[state] : "Vráceno do AGC";
}

export function stateClass(state: ReprofilingState | null) {
  return `rp-s-${state ?? "vraceno"}`;
}

/** Datum a čas z API (UTC bez zóny) v místním čase. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return toDate(value).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatCzk(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
}

export function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - toDate(value).getTime()) / 86_400_000));
}

export function daysLabel(days: number) {
  if (days === 0) return "dnes";
  if (days === 1) return "1 den";
  return days < 5 ? `${days} dny` : `${days} dní`;
}

function toDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

/** Poslední (rozpracovaná) reprofilace u této firmy. */
export function currentJob(wheel: RepairWheel) {
  return wheel.at_us ? wheel.reprofilings.find((r) => !r.returned_at) ?? null : null;
}

/** Okno „Reprofilace hotová“: cena (nepovinná — často ji určí až faktura) a poznámka. */
export function DoneDialog({ wheel, onClose, onSaved }: { wheel: RepairWheel; onClose: () => void; onSaved: (w: RepairWheel) => void }) {
  const job = currentJob(wheel);
  const [cost, setCost] = useState(job?.cost != null ? String(job.cost) : "");
  const [note, setNote] = useState(job?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const price = cost.trim() ? Number(cost.replace(/\s/g, "").replace(",", ".")) : null;
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      setError("Cena musí být číslo, nebo ji nechte prázdnou.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.repair.done(wheel.id, { cost: price, note: note.trim() || null }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="rp-dialog-back" onClick={onClose}>
      <form className="rp-dialog" role="dialog" aria-modal="true" aria-labelledby="rp-done-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="rp-dialog-head">
          <h2 id="rp-done-title">Reprofilace hotová</h2>
          <p>Kotouč <strong>{wheel.serial_number}</strong> · {wheel.manufacturer} · Ø {wheel.diameter} mm</p>
        </div>
        <div className="rp-dialog-body">
          <label htmlFor="rp-cost">Cena reprofilace</label>
          <div className="rp-money">
            <input id="rp-cost" inputMode="decimal" autoFocus value={cost} onChange={(e) => setCost(e.target.value)} placeholder="např. 1 850" />
            <span>Kč</span>
          </div>
          <div className="rp-hint">Nepovinné — když cenu ještě nevíte, doplníte ji později přes „Upravit hlášení“.</div>
          <label htmlFor="rp-note">Poznámka pro AGC</label>
          <input id="rp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="např. přebroušen profil, kontrola OK" />
          {error && <div className="rp-error">{error}</div>}
        </div>
        <div className="rp-dialog-foot">
          <button type="button" className="rp-btn rp-btn-line" onClick={onClose}>Zpět</button>
          <button type="submit" className="rp-btn rp-btn-green" disabled={busy}>{busy ? "Ukládám…" : "Uložit — hotovo"}</button>
        </div>
      </form>
    </div>
  );
}

/** Okno „Nelze reprofilovat“ s důvodem. */
export function FailDialog({ wheel, onClose, onSaved }: { wheel: RepairWheel; onClose: () => void; onSaved: (w: RepairWheel) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.repair.failed(wheel.id, reason.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="rp-dialog-back" onClick={onClose}>
      <form className="rp-dialog" role="dialog" aria-modal="true" aria-labelledby="rp-fail-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="rp-dialog-head">
          <h2 id="rp-fail-title">Nelze reprofilovat</h2>
          <p>Kotouč <strong>{wheel.serial_number}</strong> — AGC rozhodne o vyřazení.</p>
        </div>
        <div className="rp-dialog-body">
          <label htmlFor="rp-reason">Proč nejde reprofilovat?</label>
          <input id="rp-reason" autoFocus required minLength={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="např. málo diamantové vrstvy" />
          {error && <div className="rp-error">{error}</div>}
        </div>
        <div className="rp-dialog-foot">
          <button type="button" className="rp-btn rp-btn-line" onClick={onClose}>Zpět</button>
          <button type="submit" className="rp-btn rp-btn-danger" disabled={busy || reason.trim().length < 2}>{busy ? "Ukládám…" : "Uložit — nelze"}</button>
        </div>
      </form>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** Tlačítka dalšího kroku pro kotouč u firmy (nástěnka i karta kotouče). */
export function JobActions({ wheel, onChanged }: { wheel: RepairWheel; onChanged: (w: RepairWheel) => void }) {
  const [dialog, setDialog] = useState<"done" | "fail" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!wheel.at_us) return null;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.repair.accept(wheel.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  const saved = (w: RepairWheel) => { setDialog(null); onChanged(w); };

  return (
    <div className="rp-job-actions">
      {wheel.state === "ceka" && (
        <button className="rp-btn rp-btn-amber rp-btn-lg" disabled={busy} onClick={() => void accept()}>✓ Převzít kotouč</button>
      )}
      {wheel.state === "prevzato" && (
        <button className="rp-btn rp-btn-green rp-btn-lg" onClick={() => setDialog("done")}>Reprofilace hotová</button>
      )}
      {wheel.state === "hotovo" && (
        <button className="rp-btn rp-btn-line" onClick={() => setDialog("done")}>Upravit hlášení (cena, poznámka)</button>
      )}
      {(wheel.state === "ceka" || wheel.state === "prevzato") && (
        <button className="rp-link-btn" onClick={() => setDialog("fail")}>Nelze reprofilovat…</button>
      )}
      {error && <div className="rp-error">{error}</div>}
      {dialog === "done" && <DoneDialog wheel={wheel} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog === "fail" && <FailDialog wheel={wheel} onClose={() => setDialog(null)} onSaved={saved} />}
    </div>
  );
}
