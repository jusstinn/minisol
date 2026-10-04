"use client";

/** The root layout itself failed: a plain page (no app styles are available here). */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ro">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#F2EFE8", color: "#141311", fontFamily: "system-ui, sans-serif" }}>
        <title>Blueprint</title>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Ceva n-a mers · Something went wrong</h1>
          <button onClick={() => retry()} style={{ background: "#141311", color: "#F2EFE8", border: 0, borderRadius: 999, padding: "10px 20px", fontSize: 15, cursor: "pointer" }}>
            Reîncearcă · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
