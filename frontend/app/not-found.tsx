import Link from "next/link";

export default function NotFound() {
  return (
    <main className="document-page" id="content">
      <div className="document-card">
        <p className="eyebrow">404</p>
        <h1 className="document-title">That route is outside the indexed workspace.</h1>
        <div className="document-body">
          <p>
            Use the main desk to upload PDFs, inspect the active document set, and ask grounded questions
            against the retrieval index.
          </p>
        </div>
        <div className="document-actions">
          <Link className="command-button button-primary" href="/">
            Return home
          </Link>
          <Link className="back-link" href="/">
            Back to workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
