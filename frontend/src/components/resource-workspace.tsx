"use client";

import Link from "next/link";
import { startTransition, useEffect, useId, useRef, useState } from "react";
import { fetchDocuments, sendQuestion, uploadDocument } from "@/lib/api";
import type { Message, ResourceDocument } from "@/lib/types";

const quickPrompts = [
  "Summarize the strongest claims in this PDF.",
  "List every date, name, and number worth checking.",
  "Which section sounds the least supported by evidence?",
];

const retrievalNotes = [
  "PDFs are indexed before the assistant can answer.",
  "Responses are grounded in retrieved chunks only.",
  "Citations stay attached to the response that used them.",
];

function formatDate(rawDate: string) {
  const parsed = Date.parse(rawDate);

  if (Number.isNaN(parsed)) {
    return rawDate;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatFileSize(sizeInBytes: number) {
  if (sizeInBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeInBytes / 1024))} KB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function trimFileExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function makeDocumentBadge(filename: string) {
  const parts = trimFileExtension(filename)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "PDF";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function describeError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Connection failed. Please try again.";
}

export default function ResourceWorkspace() {
  const [documents, setDocuments] = useState<ResourceDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "processing" | "success">(
    "idle",
  );
  const [uploadProgress, setUploadProgress] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const fileInputId = useId();
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadDocuments();
  }, []);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [messages, chatLoading]);

  async function loadDocuments() {
    setDocumentsLoading(true);
    setDocumentsError(null);

    try {
      const nextDocuments = await fetchDocuments();
      startTransition(() => {
        setDocuments(nextDocuments);
      });
    } catch (error) {
      setDocumentsError(describeError(error));
    } finally {
      setDocumentsLoading(false);
    }
  }

  function rememberFile(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      setUploadError("Only PDF files are supported right now.");
      setSelectedFile(null);
      return;
    }

    setUploadError(null);
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setUploadError("Choose a PDF before processing.");
      return;
    }

    const filename = selectedFile.name;

    setUploadError(null);
    setUploadProgress(0);
    setUploadState("uploading");

    try {
      await uploadDocument(selectedFile, (progress) => {
        setUploadProgress(progress);
        if (progress >= 100) {
          setUploadState("processing");
        }
      });

      setUploadState("success");
      setSelectedFile(null);
      await loadDocuments();

      startTransition(() => {
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            sender: "assistant",
            text: `${filename} is indexed. Ask for a summary, a source check, or a precise detail.`,
            citations: [filename],
          },
        ]);
      });
    } catch (error) {
      setUploadState("idle");
      setUploadError(describeError(error));
      return;
    }

    window.setTimeout(() => {
      setUploadState("idle");
      setUploadProgress(0);
    }, 900);
  }

  async function handleQuestionSubmit() {
    const trimmed = question.trim();

    if (!trimmed) {
      setChatError("Write a question before sending.");
      return;
    }

    if (documents.length === 0) {
      setChatError("Upload at least one PDF before starting the conversation.");
      return;
    }

    setChatError(null);
    setChatLoading(true);

    const userId = makeId();
    const assistantId = makeId();

    startTransition(() => {
      setMessages((current) => [
        ...current,
        {
          id: userId,
          sender: "user",
          text: trimmed,
          citations: [],
        },
        {
          id: assistantId,
          sender: "assistant",
          text: "Searching the index and grounding a response...",
          citations: [],
          pending: true,
        },
      ]);
    });

    setQuestion("");

    try {
      const response = await sendQuestion(trimmed);

      startTransition(() => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  text: response.answer,
                  citations: response.citations ?? [],
                  pending: false,
                }
              : message,
          ),
        );
      });
    } catch (error) {
      const message = describeError(error);
      setChatError(message);

      startTransition(() => {
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId
              ? {
                  ...entry,
                  text: message,
                  citations: [],
                  pending: false,
                }
              : entry,
          ),
        );
      });
    } finally {
      setChatLoading(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const nextFile = event.dataTransfer.files?.[0];
    rememberFile(nextFile ?? null);
  }

  const latestDocument = documents[0] ?? null;
  const totalChunks = documents.reduce((sum, document) => sum + document.chunk_count, 0);
  const statusLabel =
    uploadState === "uploading"
      ? "Uploading"
      : uploadState === "processing"
        ? "Processing"
        : uploadState === "success"
          ? "Indexed"
          : "Standby";

  return (
    <div className="workspace-frame">
      <div className="workspace-app">
        <aside className="workspace-sidebar">
          <section className="brand-block">
            <div className="brand-mark" aria-hidden="true">
              RS
            </div>
            <div className="brand-copy">
              <p className="section-kicker">Evidence desk</p>
              <h1 className="brand-name">ReSource</h1>
              <p className="brand-description">
                A calmer interface for indexing PDFs and questioning the record without the visual noise.
              </p>
            </div>
          </section>

          <section className="panel panel-upload">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <p className="section-kicker">Intake</p>
                <h2 className="panel-title">Index a document</h2>
              </div>
              <span className="toolbar-pill">{statusLabel}</span>
            </div>

            <div
              className={`upload-dropzone ${dragActive ? "upload-dropzone-active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return;
                }
                setDragActive(false);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                aria-label="Choose PDF file"
                className="sr-only"
                id={fileInputId}
                type="file"
                accept="application/pdf"
                onChange={(event) => rememberFile(event.target.files?.[0] ?? null)}
              />

              <div className="upload-copy">
                <p className="upload-title">Drop a PDF here or pick one manually.</p>
                <p className="upload-body">
                  Keep the ingestion step blunt: one file in, one clean path to retrieval and citation.
                </p>
              </div>

              <div className="upload-actions">
                <label className="command-button button-secondary dropzone-trigger" htmlFor={fileInputId}>
                  Choose PDF
                </label>
                <button
                  className="command-button button-primary"
                  disabled={uploadState === "uploading" || uploadState === "processing"}
                  onClick={() => {
                    void handleUpload();
                  }}
                  type="button"
                >
                  {uploadState === "uploading"
                    ? "Uploading..."
                    : uploadState === "processing"
                      ? "Processing..."
                      : "Index document"}
                </button>
              </div>

              <div className="upload-summary">
                <div className="upload-summary-block">
                  <p className="upload-label">Selected file</p>
                  <p className="upload-value">{selectedFile ? selectedFile.name : "No file selected"}</p>
                </div>
                <div className="upload-summary-block">
                  <p className="upload-label">Size</p>
                  <p className="upload-value">{selectedFile ? formatFileSize(selectedFile.size) : "PDF only"}</p>
                </div>
              </div>

              <div className="progress-track" aria-hidden="true">
                <div
                  className="progress-fill"
                  style={{
                    width:
                      uploadState === "processing"
                        ? "100%"
                        : `${Math.max(uploadProgress, uploadState === "success" ? 100 : 4)}%`,
                  }}
                />
              </div>

              {uploadError ? <p className="inline-feedback inline-feedback-error">{uploadError}</p> : null}
            </div>
          </section>

          <section className="panel panel-library">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <p className="section-kicker">Library</p>
                <h2 className="panel-title">Indexed documents</h2>
              </div>
              <button
                className="command-button button-secondary panel-action-button"
                onClick={() => {
                  void loadDocuments();
                }}
                type="button"
              >
                Refresh
              </button>
            </div>

            <div className="panel-copy">
              Every file in the record stays visible here with its ingestion date and chunk count.
            </div>

            <div className="library-scroll">
              {documentsLoading ? (
                <div className="empty-state">
                  <div className="skeleton-stack" aria-hidden="true">
                    {[0, 1, 2].map((row) => (
                      <div className="skeleton-bar" key={row} />
                    ))}
                  </div>
                </div>
              ) : documentsError ? (
                <p className="inline-feedback inline-feedback-error">{documentsError}</p>
              ) : documents.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-title">Library is empty</p>
                  <p className="empty-copy">
                    Upload the first PDF and this list becomes the permanent record for every indexed file.
                  </p>
                </div>
              ) : (
                <ol className="document-list">
                  {documents.map((document, index) => (
                    <li
                      className={`document-row ${index === 0 ? "document-row-current" : ""}`}
                      key={document.id}
                    >
                      <div className="document-badge" aria-hidden="true">
                        {makeDocumentBadge(document.filename)}
                      </div>
                      <div className="document-main">
                        <p className="document-name">{document.filename}</p>
                        <p className="document-meta">Indexed {formatDate(document.upload_date)}</p>
                      </div>
                      <div className="document-count">{document.chunk_count} chunks</div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </aside>

        <section className="conversation-panel">
          <header className="conversation-topbar">
            <div className="conversation-header">
              <p className="section-kicker">Grounded chat</p>
              <h2 className="conversation-title">Question the record in one clean thread.</h2>
              <p className="conversation-copy">
                Ask for summaries, factual checks, or precise details. The assistant responds only after
                retrieval has done its job.
              </p>
            </div>

            <div className="status-cluster" aria-label="Workspace overview">
              <div className="status-chip">
                <span className="status-chip-label">Documents</span>
                <span className="status-chip-value">{documents.length}</span>
              </div>
              <div className="status-chip">
                <span className="status-chip-label">Chunks</span>
                <span className="status-chip-value">{totalChunks}</span>
              </div>
              <div className="status-chip">
                <span className="status-chip-label">Mode</span>
                <span className="status-chip-value">RAG</span>
              </div>
            </div>
          </header>

          <div className="conversation-stage">
            <div className="transcript-surface" ref={transcriptRef}>
              {messages.length === 0 ? (
                <div className="empty-conversation">
                  <p className="empty-title">
                    {documents.length === 0 ? "Start with a document." : "The index is ready."}
                  </p>
                  <p className="empty-copy">
                    {documents.length === 0
                      ? "Once a PDF is indexed, this thread becomes the answer surface for summaries, checks, and citations."
                      : "Ask a direct question, request a summary, or pressure-test a claim."}
                  </p>

                  {documents.length > 0 ? (
                    <div className="prompt-row">
                      {quickPrompts.map((prompt) => (
                        <button
                          className="prompt-chip"
                          key={prompt}
                          onClick={() => setQuestion(prompt)}
                          type="button"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="message-thread">
                  {messages.map((message) => (
                    <article
                      className={`message-card ${
                        message.sender === "user" ? "message-user" : "message-assistant"
                      } ${message.pending ? "message-pending" : ""}`}
                      key={message.id}
                    >
                      <div className="message-meta">
                        <span>{message.sender === "user" ? "You" : "ReSource"}</span>
                        <span>{message.pending ? "Working" : "Delivered"}</span>
                      </div>
                      <p className="message-text">{message.text}</p>
                      {message.citations.length > 0 ? (
                        <div className="citation-row">
                          {message.citations.map((citation) => (
                            <span className="citation-chip" key={`${message.id}-${citation}`}>
                              {citation}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="composer-shell">
              <div className="input-group">
                <label className="composer-label" htmlFor="question">
                  Ask a question
                </label>
                <textarea
                  className="field"
                  id="question"
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleQuestionSubmit();
                    }
                  }}
                  placeholder="Ask for a summary, a citation trail, or a detail check."
                  value={question}
                />
                <p className="form-helper">Press Enter to send. Use Shift+Enter for a line break.</p>
              </div>

              {chatError ? <p className="inline-feedback inline-feedback-error">{chatError}</p> : null}

              <div className="composer-actions">
                <p className="composer-note">
                  {chatLoading
                    ? "Retrieving relevant chunks and grounding the response."
                    : "Answers stay attached to the uploaded record."}
                </p>
                <button
                  className="command-button button-primary composer-submit"
                  disabled={chatLoading}
                  onClick={() => {
                    void handleQuestionSubmit();
                  }}
                  type="button"
                >
                  {chatLoading ? "Searching..." : "Ask ReSource"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="workspace-inspector">
          <section className="panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <p className="section-kicker">Record snapshot</p>
                <h2 className="panel-title">What the workspace knows right now</h2>
              </div>
            </div>

            <div className="stat-list">
              <div className="stat-row">
                <span className="stat-label">Latest document</span>
                <span className="stat-value">
                  {latestDocument ? trimFileExtension(latestDocument.filename) : "No documents yet"}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Last indexed</span>
                <span className="stat-value">
                  {latestDocument ? formatDate(latestDocument.upload_date) : "Waiting for first upload"}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Chunks available</span>
                <span className="stat-value">{totalChunks}</span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <p className="section-kicker">Shortcuts</p>
                <h2 className="panel-title">Prompt starters</h2>
              </div>
            </div>
            <div className="quick-list">
              {quickPrompts.map((prompt) => (
                <button
                  className="prompt-chip prompt-chip-block"
                  key={prompt}
                  onClick={() => setQuestion(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <p className="section-kicker">Guardrails</p>
                <h2 className="panel-title">How answers are produced</h2>
              </div>
            </div>
            <ol className="steps-list">
              {retrievalNotes.map((note) => (
                <li className="steps-item" key={note}>
                  {note}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <footer className="workspace-footer">
        <p className="footer-copy">Grounded PDF retrieval, cleaner surfaces, less visual friction.</p>
        <div className="footer-links">
          <Link className="legal-link" href="/privacy">
            Privacy
          </Link>
          <Link className="legal-link" href="/terms">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
