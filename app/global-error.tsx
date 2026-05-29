"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            padding: "2rem",
            textAlign: "center",
            borderRadius: "0.75rem",
            border: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)"
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
            The application ran into an unexpected error. Please try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.5rem",
              backgroundColor: "#2563eb",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#ffffff",
              border: "none",
              cursor: "pointer"
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
