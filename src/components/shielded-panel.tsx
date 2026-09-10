"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { createNote, serialiseNote, parseNote, type Note } from "@/lib/shielded";
import { SHIELDED_POOLS, type ShieldedPool } from "@/lib/shielded-pools";
import { useToast } from "./toast";

type Tab = "deposit" | "withdraw";

export function ShieldedPanel() {
  const [tab, setTab] = useState<Tab>("deposit");
  const [pool, setPool] = useState<ShieldedPool>(SHIELDED_POOLS[0]);

  return (
    <>
      <div className="panel" style={{ padding: 8, display: "flex", gap: 6, marginBottom: 14 }}>
        {(["deposit", "withdraw"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="btn"
            style={{
              flex: 1,
              border: 0,
              background: tab === t ? "var(--surface-2)" : "transparent",
              color: tab === t ? "var(--text)" : "var(--muted)",
              fontWeight: tab === t ? 650 : 500,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="two-col" style={{ alignItems: "start", gap: 14 }}>
        <div>
          {tab === "deposit" ? (
            <Deposit pool={pool} setPool={setPool} />
          ) : (
            <Withdraw />
          )}
        </div>
        <HowItWorks />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ deposit */

function Deposit({
  pool,
  setPool,
}: {
  pool: ShieldedPool;
  setPool: (p: ShieldedPool) => void;
}) {
  const { isConnected } = useAccount();
  const { push } = useToast();
  const [note, setNote] = useState<Note | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const serialised = note ? serialiseNote(note) : "";

  async function generate() {
    setBusy(true);
    try {
      const n = await createNote(pool.id);
      setNote(n);
      setSaved(false);
    } catch {
      push({ tone: "error", title: "Could not generate a note", body: "Reload and try again." });
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    navigator.clipboard?.writeText(serialised);
    push({ tone: "success", title: "Note copied", body: "Paste it somewhere safe before depositing." });
  }

  function download() {
    const blob = new Blob([serialised], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `refract-note-${pool.id}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    push({ tone: "success", title: "Note downloaded" });
  }

  return (
    <div className="panel panel-lit" style={{ padding: 22 }}>
      <div className="kicker" style={{ marginBottom: 12 }}>
        Pool
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {SHIELDED_POOLS.map((p) => (
          <button
            key={p.id}
            className="chip"
            data-on={p.id === pool.id}
            onClick={() => {
              setPool(p);
              setNote(null);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
        Every deposit in a pool is the same size, which is what makes them
        indistinguishable. Mixed amounts would let anyone match a withdrawal to
        a deposit by its value alone.
      </p>

      {!note ? (
        <button className="btn btn-primary btn-lg" onClick={generate} disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? "Generating" : "Generate note"}
        </button>
      ) : (
        <>
          {/* The single highest-stakes moment in the product. */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 13,
              background: "color-mix(in srgb, var(--ember) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--ember) 40%, transparent)",
              marginBottom: 14,
              display: "flex",
              gap: 11,
              alignItems: "flex-start",
            }}
          >
            <span style={{ color: "var(--ember)", fontSize: 15, lineHeight: 1.2 }}>&#9888;</span>
            <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.55 }}>
              <b>This note is the only way to get your funds back.</b> It is not
              stored anywhere, not by us and not in your wallet. If you lose it
              the deposit is gone permanently, and anyone who finds it can spend
              it.
            </div>
          </div>

          <div
            className="mono"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "14px 15px",
              fontSize: 11.5,
              wordBreak: "break-all",
              lineHeight: 1.6,
              color: "var(--text)",
              marginBottom: 12,
            }}
          >
            {serialised}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className="btn" style={{ flex: 1 }} onClick={copy}>
              Copy
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={download}>
              Download
            </button>
          </div>

          <label
            style={{
              display: "flex",
              gap: 11,
              alignItems: "flex-start",
              cursor: "pointer",
              fontSize: 13.5,
              color: "var(--muted)",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              style={{ accentColor: "var(--gold)", width: 17, height: 17, marginTop: 1, flexShrink: 0 }}
            />
            I have saved this note somewhere I can find it again.
          </label>

          <button
            className="btn btn-primary btn-lg"
            disabled={!saved || !isConnected}
            title={!isConnected ? "Connect a wallet first" : undefined}
          >
            {!isConnected ? "Connect wallet to deposit" : `Deposit ${pool.label}`}
          </button>

          <p className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 12, lineHeight: 1.6 }}>
            Awaiting pool deployment. The note above is real and generated in
            your browser; the deposit button activates once the pool contract is
            live on 4663.
          </p>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- withdraw */

function Withdraw() {
  const { push } = useToast();
  const [raw, setRaw] = useState("");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const n = await parseNote(raw);
      setNote(n);
      push({ tone: "success", title: "Note is valid", body: `Pool: ${n.pool}` });
    } catch (e) {
      setNote(null);
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  const recipientValid = /^0x[a-fA-F0-9]{40}$/.test(recipient.trim());

  return (
    <div className="panel panel-lit" style={{ padding: 22 }}>
      <div className="kicker" style={{ marginBottom: 10 }}>
        Your note
      </div>
      <textarea
        className="input mono"
        placeholder="refract-eth-1-0x…"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={3}
        style={{ fontSize: 12, resize: "vertical", lineHeight: 1.5 }}
      />

      <div className="kicker" style={{ margin: "18px 0 10px" }}>
        Send to
      </div>
      <input
        className="input mono"
        placeholder="0x… a fresh address, ideally"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        style={{ fontSize: 12.5 }}
      />
      <p style={{ color: "var(--faint)", fontSize: 12, lineHeight: 1.55, marginTop: 9 }}>
        Withdrawing to the address you deposited from links the two and undoes
        the privacy. Use one that has never touched this pool.
      </p>

      {error && (
        <div className="mono" style={{ color: "var(--ember)", fontSize: 12, marginTop: 12 }}>
          {error}
        </div>
      )}

      {note && !error && (
        <div
          className="panel-flat"
          style={{ padding: "13px 15px", marginTop: 14, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}
        >
          Note parsed for pool <b style={{ color: "var(--text)" }}>{note.pool}</b>. Its
          nullifier and secret never leave this page.
        </div>
      )}

      <button
        className="btn"
        style={{ width: "100%", marginTop: 16 }}
        onClick={check}
        disabled={!raw.trim() || checking}
      >
        {checking && <span className="spinner" />}
        {checking ? "Checking" : "Check note"}
      </button>

      <button
        className="btn btn-primary btn-lg"
        style={{ marginTop: 10 }}
        disabled={!note || !recipientValid}
      >
        {!note ? "Check your note first" : !recipientValid ? "Enter a recipient" : "Generate proof and withdraw"}
      </button>

      <p className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 12, lineHeight: 1.6 }}>
        Proving takes a few seconds and happens entirely in your browser.
        Awaiting pool deployment on 4663.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- aside */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      t: "Your browser makes a secret",
      d: "Two random numbers, generated locally. Their hash is the commitment that goes on-chain. Nothing that identifies you leaves the page.",
    },
    {
      n: "02",
      t: "The deposit joins a crowd",
      d: "Your commitment is inserted into a Merkle tree alongside everyone else's. Observers see a deposit happened. They cannot see which one is yours.",
    },
    {
      n: "03",
      t: "You prove, you do not ask",
      d: "To spend, your browser proves it knows a secret behind some commitment in the tree, without revealing which. There is no operator to approve it.",
    },
    {
      n: "04",
      t: "Spent once, permanently",
      d: "The proof publishes a nullifier so the note cannot be reused. The nullifier cannot be traced back to your deposit.",
    },
  ];

  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="panel" style={{ padding: "20px 22px" }}>
        <div className="kicker" style={{ marginBottom: 14 }}>
          How it works
        </div>
        {steps.map((s) => (
          <div key={s.n} style={{ display: "flex", gap: 13, marginBottom: 15 }}>
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--gold)", flexShrink: 0, marginTop: 2, letterSpacing: "0.1em" }}
            >
              {s.n}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 4 }}>{s.t}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="panel"
        style={{
          padding: "18px 20px",
          borderColor: "color-mix(in srgb, var(--gold) 34%, transparent)",
        }}
      >
        <div className="kicker" style={{ marginBottom: 10 }}>
          What this does not hide
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontSize: 12.5, lineHeight: 1.65 }}>
          <li>That a deposit and a withdrawal happened, and when</li>
          <li>The amount, since each pool has one fixed size</li>
          <li>Timing, if you withdraw moments after depositing</li>
          <li>Anything, if you withdraw to the address you deposited from</li>
        </ul>
      </div>
    </aside>
  );
}
