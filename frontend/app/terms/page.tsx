import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="legal-shell" id="content">
      <div className="legal-panel">
        <div className="legal-header">
          <p className="section-kicker">Terms</p>
          <h1 className="legal-title">Use the workspace like a retrieval tool, not an oracle.</h1>
        </div>
        <div className="legal-body">
          <p>
            ReSource is built to index PDFs and answer questions against retrieved context. It should not
            be treated as legal, medical, or financial advice, even when the source material looks
            authoritative.
          </p>
          <p>
            You are responsible for the documents you upload, the retention of those files, and the
            consequences of exposing the backend to other users or networks.
          </p>
          <p>
            Before production use, harden the API, add authentication, and review logging, storage, and
            model-provider policies.
          </p>
        </div>
        <div className="legal-actions">
          <Link className="command-button button-primary" href="/">
            Back to workspace
          </Link>
          <Link className="back-link" href="/">
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}
