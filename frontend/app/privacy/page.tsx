import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-shell" id="content">
      <div className="legal-panel">
        <div className="legal-header">
          <p className="section-kicker">Privacy</p>
          <h1 className="legal-title">The workspace stays close to your documents.</h1>
        </div>
        <div className="legal-body">
          <p>
            Uploaded PDFs are stored by the backend so the retrieval index can answer later questions.
            The current system is designed for local development and self-hosted use, not public
            multi-tenant traffic.
          </p>
          <p>
            Embeddings are generated on the backend using a local sentence-transformer model. Answer
            synthesis uses Google Gemini only after the backend retrieves the most relevant chunks from
            your stored documents.
          </p>
          <p>
            If you deploy this beyond your own machine, add authentication, retention rules, and a real
            storage policy before exposing the app to other users.
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
