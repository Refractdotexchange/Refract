/**
 * The explainer beside the pool.
 *
 * Deliberately paired with the list of what shielding does not hide. A privacy
 * tool that only advertises its strengths teaches people to trust it in
 * situations it was never going to cover.
 */
export function HowShieldingWorks() {
  const steps = [
    {
      n: "01",
      title: "Your browser makes a note",
      body: "A hidden amount and two random numbers. Their hash goes on-chain. Nothing that identifies you leaves the page.",
    },
    {
      n: "02",
      title: "Every size shares one pool",
      body: "Notes of any value sit in the same tree, so the crowd you hide in is everyone using the pool rather than everyone who picked the same amount.",
    },
    {
      n: "03",
      title: "You prove, you do not ask",
      body: "Spending proves you know the secret behind some note and that the sums balance, without revealing which note or what it held.",
    },
    {
      n: "04",
      title: "Change stays shielded",
      body: "Spend part of a note and the remainder comes back as a fresh hidden note, encrypted to you. Only what you withdraw is ever visible.",
    },
  ];

  return (
    <aside style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ padding: "18px 20px" }}>
        <div className="kicker" style={{ marginBottom: 14 }}>How it works</div>
        <div style={{ display: "grid", gap: 15 }}>
          {steps.map((s) => (
            <div key={s.n} style={{ display: "flex", gap: 13 }}>
              <div className="mono" style={{ color: "var(--gold)", fontSize: 11.5, paddingTop: 2 }}>
                {s.n}
              </div>
              <div>
                <div style={{ fontWeight: 650, fontSize: 13.5, marginBottom: 4 }}>{s.title}</div>
                <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="panel"
        style={{ padding: "18px 20px", borderColor: "color-mix(in srgb, var(--gold) 34%, transparent)" }}
      >
        <div className="kicker" style={{ marginBottom: 10 }}>What this does not hide</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontSize: 12.5, lineHeight: 1.65 }}>
          <li>That a deposit and a withdrawal happened, and when</li>
          <li>Timing, if you withdraw moments after depositing</li>
          <li>Anything, if you withdraw to the address you deposited from</li>
          <li>
            Whichever wallet pays gas for the withdrawal, which stays in the
            transaction permanently. If it can be tied to you, so can the
            withdrawal
          </li>
          <li>
            Your network. The notes are read and the transaction is sent over
            the same connection, so an RPC provider sees both ends even though
            the chain does not
          </li>
        </ul>
      </div>
    </aside>
  );
}
