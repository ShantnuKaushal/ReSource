"use client";

import { startTransition, useEffect, useId, useMemo, useRef, useState } from "react";
import { fetchDocuments, sendQuestion, uploadDocument } from "@/lib/api";
import type { Message, ResourceDocument } from "@/lib/types";

const imgEllipse1 = "https://www.figma.com/api/mcp/asset/0d817736-9c0b-4eb1-beb6-fecb96ecebd0";
const imgEllipse2 = "https://www.figma.com/api/mcp/asset/5362a6bb-04b5-4e31-bee8-37fae1cc27b1";
const imgRectangle1 = "https://www.figma.com/api/mcp/asset/fdc7d392-f463-45bb-872f-eaa690992658";
const imgRectangle2 = "https://www.figma.com/api/mcp/asset/322169c7-972f-4fe2-a08a-84f97774b82a";
const imgEllipse3 = "https://www.figma.com/api/mcp/asset/6bc739c5-0a80-4c92-9218-a4b87ff93fcb";
const imgEllipse4 = "https://www.figma.com/api/mcp/asset/47518ef2-029c-49e1-bad3-1ab1212c7c8c";
const imgEllipse5 = "https://www.figma.com/api/mcp/asset/e5be7d45-6594-4e85-b3a9-efa3c3204fd6";
const imgEllipse6 = "https://www.figma.com/api/mcp/asset/9e8c0bd0-d351-4f25-a83a-d7f54702ab22";
const imgEllipse7 = "https://www.figma.com/api/mcp/asset/b4a8c7b5-cec8-4144-aa16-f8ad1bfe4c31";
const imgEllipse8 = "https://www.figma.com/api/mcp/asset/6280be89-be98-47ef-8e90-874ddf69ee6c";
const imgFrame = "https://www.figma.com/api/mcp/asset/5ec5ff76-bca6-427c-abda-f121bba4fe75";
const imgFrame1 = "https://www.figma.com/api/mcp/asset/ceba86e9-6016-40b7-abd7-5dc6581030e2";
const imgFrame2 = "https://www.figma.com/api/mcp/asset/fc6b8904-4fc7-4482-bc33-ee358d96193c";
const imgFrame3 = "https://www.figma.com/api/mcp/asset/08d39d25-bb1c-4daf-8431-887b146b3e3e";
const imgFrame4 = "https://www.figma.com/api/mcp/asset/9787c6a0-56ff-4038-9afa-2c145db55bf1";
const imgFrame5 = "https://www.figma.com/api/mcp/asset/c7723612-9e83-4927-9a5c-b10cf5e30800";
const imgFrame6 = "https://www.figma.com/api/mcp/asset/26553f70-2f95-4bcb-aba7-bfc95d1ad674";
const imgFrame7 = "https://www.figma.com/api/mcp/asset/211564e4-9f48-4eb5-80e3-bf393da51820";
const imgFrame8 = "https://www.figma.com/api/mcp/asset/f9716c24-d248-493b-8edc-043c7bec7f8f";
const imgFrame9 = "https://www.figma.com/api/mcp/asset/41846e4d-86ab-4691-8724-5c94f54ac12b";
const imgWindowControl = "https://www.figma.com/api/mcp/asset/373e6dc0-a204-400c-98e9-8b6da2274b47";

const avatarPool = [imgEllipse3, imgEllipse4, imgEllipse5, imgEllipse6, imgEllipse7, imgEllipse8];

const fallbackContacts = [
  { name: "Elanor", subtitle: "lorem ipsum dolr", avatar: imgEllipse3 },
  { name: "Alvin", subtitle: "lorem ipsum dolr", avatar: imgEllipse4 },
  { name: "Summer", subtitle: "lorem ipsum dolr", avatar: imgEllipse5 },
  { name: "Greg", subtitle: "lorem ipsum dolr", avatar: imgEllipse6 },
  { name: "Walt", subtitle: "lorem ipsum dolr", avatar: imgEllipse7 },
  { name: "Jesse", subtitle: "lorem ipsum dolr", avatar: imgEllipse8 },
];

const sampleTranscript = [
  { kind: "assistant", text: "okay, see ya at 6" },
  { kind: "divider", text: "Yesterday, 18:04" },
  { kind: "user", text: "heyy" },
  { kind: "user", text: "i've arrived" },
  { kind: "divider", text: "Today, 12:21" },
  { kind: "assistant", text: "heyyy" },
  { kind: "assistant", text: "can you send me the photos from yesterday?" },
  { kind: "assistant", text: "greg really likes them :)" },
  { kind: "user", text: "here you go" },
  { kind: "gallery" },
  { kind: "user", text: "they look pretty good" },
  { kind: "assistant", text: "hahaha sure" },
  { kind: "assistant", text: "thanks a bunch!" },
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

function makeDocumentSubtitle(document: ResourceDocument) {
  return `${document.chunk_count} chunks ready`;
}

type RailRow = {
  key: string;
  label: string;
  sublabel: string;
  avatar: string;
  documentId?: number;
};

export default function ResourceWorkspace() {
  const [documents, setDocuments] = useState<ResourceDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadDocuments();
  }, []);

  useEffect(() => {
    setSelectedDocumentId((current) => {
      if (documents.length === 0) {
        return null;
      }

      if (current && documents.some((document) => document.id === current)) {
        return current;
      }

      return documents[0].id;
    });
  }, [documents]);

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
      fileInputRef.current?.click();
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
          text: "Searching index and grounding response...",
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

  const selectedDocument =
    documents.find((document) => document.id === selectedDocumentId) ?? documents[0] ?? null;

  const railRows = useMemo<RailRow[]>(() => {
    const documentRows = documents.slice(0, 6).map((document, index) => ({
      key: `doc-${document.id}`,
      label: trimFileExtension(document.filename),
      sublabel: makeDocumentSubtitle(document),
      avatar: avatarPool[index % avatarPool.length],
      documentId: document.id,
    }));

    if (documentRows.length >= 6) {
      return documentRows;
    }

    return [...documentRows, ...fallbackContacts.slice(documentRows.length).map((item, index) => ({
      key: `fallback-${index}`,
      label: item.name,
      sublabel: item.subtitle,
      avatar: item.avatar,
    }))];
  }, [documents]);

  const conversationName = selectedDocument ? trimFileExtension(selectedDocument.filename) : "Elanor";
  const displayedMessages = messages.length === 0 ? sampleTranscript : null;
  const activeProgressWidth =
    uploadState === "processing" ? "100%" : `${Math.max(uploadProgress, uploadState === "success" ? 100 : 4)}%`;

  return (
    <div className="workspace-frame workspace-frame-figma">
      <input
        aria-label="Choose PDF file"
        className="sr-only"
        id={fileInputId}
        type="file"
        accept="application/pdf"
        onChange={(event) => rememberFile(event.target.files?.[0] ?? null)}
        ref={fileInputRef}
      />

      <div className="figma-message-shell" data-name="Message" data-node-id="611:97">
        <div className="figma-window-control">
          <img alt="" className="figma-full-img" src={imgWindowControl} />
        </div>

        <button
          className="figma-avatar-home"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <img alt="" className="figma-full-img" src={imgEllipse1} />
          <span className="sr-only">Choose PDF file</span>
        </button>

        <nav className="figma-menu" aria-label="Workspace shortcuts">
          <button className="figma-menu-item figma-menu-item-active" onClick={handleUpload} type="button">
            <div className="figma-menu-icon-wrap">
              <img alt="" className="figma-full-img" src={imgFrame} />
            </div>
            <span className="sr-only">Index document</span>
          </button>
          <button
            className="figma-menu-item"
            onClick={() => {
              void loadDocuments();
            }}
            type="button"
          >
            <div className="figma-menu-icon-wrap">
              <img alt="" className="figma-full-img" src={imgFrame1} />
            </div>
            <span className="sr-only">Refresh documents</span>
          </button>
          <button className="figma-menu-item" onClick={() => setQuestion("Summarize the strongest claims in this PDF.")} type="button">
            <div className="figma-menu-icon-wrap">
              <img alt="" className="figma-full-img" src={imgFrame2} />
            </div>
            <span className="sr-only">Use quick prompt</span>
          </button>
          <button className="figma-menu-item" onClick={() => transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" })} type="button">
            <div className="figma-menu-icon-wrap">
              <img alt="" className="figma-full-img" src={imgFrame3} />
            </div>
            <span className="sr-only">Jump to latest message</span>
          </button>
        </nav>

        <div className="figma-main-frame">
          <div className="figma-chat-list-pane">
            <p className="figma-chats-title">Chats</p>

            <div className="figma-chat-list" aria-live="polite">
              {railRows.map((row, index) => {
                const isActive =
                  row.documentId != null
                    ? selectedDocument?.id === row.documentId
                    : selectedDocument == null && index === 0;

                return (
                  <button
                    className={`figma-chat-row ${isActive ? "figma-chat-row-active" : ""}`}
                    key={row.key}
                    onClick={() => {
                      if (row.documentId != null) {
                        setSelectedDocumentId(row.documentId);
                      }
                    }}
                    type="button"
                  >
                    <div className="figma-chat-row-avatar">
                      <img alt="" className="figma-full-img" src={row.avatar} />
                    </div>
                    <div className="figma-chat-row-text">
                      <p className="figma-chat-row-name">{row.label}</p>
                      <p className="figma-chat-row-subtitle">{row.sublabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {documentsLoading ? <p className="sr-only">Loading documents</p> : null}
            {documentsError ? <p className="sr-only">{documentsError}</p> : null}
            {documents.length === 0 ? <p className="sr-only">No sources indexed</p> : null}
            {selectedFile ? <p className="sr-only">Selected file {selectedFile.name}</p> : null}
            {uploadError ? <p className="sr-only">{uploadError}</p> : null}
          </div>

          <section className="figma-conversation-pane">
            <header className="figma-conversation-header">
              <div className="figma-conversation-avatar">
                <img alt="" className="figma-full-img" src={imgEllipse2} />
              </div>
              <p className="figma-conversation-name">{conversationName}</p>

              <button
                className="figma-top-action"
                onClick={() => {
                  void loadDocuments();
                }}
                type="button"
              >
                <div className="figma-top-action-icon">
                  <img alt="" className="figma-full-img" src={imgFrame6} />
                </div>
                <span className="sr-only">Refresh documents</span>
              </button>
              <button className="figma-top-action figma-top-action-secondary" onClick={handleUpload} type="button">
                <div className="figma-top-action-icon">
                  <img alt="" className="figma-full-img" src={imgFrame4} />
                </div>
                <span className="sr-only">Index document</span>
              </button>
            </header>

            <div className="figma-status-strip">
              <div className="figma-progress-track" aria-hidden="true">
                <div className="figma-progress-fill" style={{ width: activeProgressWidth }} />
              </div>
              <div className="figma-status-copy">
                <span>{selectedDocument ? formatDate(selectedDocument.upload_date) : "Standby"}</span>
                <span>{selectedDocument ? `${selectedDocument.chunk_count} chunks` : uploadState}</span>
                <span>{selectedFile ? formatFileSize(selectedFile.size) : "PDF only"}</span>
              </div>
            </div>

            <div className="figma-transcript" ref={transcriptRef}>
              {displayedMessages ? (
                <>
                  {displayedMessages.map((entry, index) => {
                    if (entry.kind === "divider") {
                      return (
                        <div className="figma-divider" key={`divider-${index}`}>
                          <div className="figma-divider-line" />
                          <p className="figma-divider-text">{entry.text}</p>
                          <div className="figma-divider-line" />
                        </div>
                      );
                    }

                    if (entry.kind === "gallery") {
                      return (
                        <div className="figma-bubble-stack figma-bubble-stack-user" key={`gallery-${index}`}>
                          <div className="figma-gallery">
                            <div className="figma-gallery-image">
                              <img alt="" className="figma-gallery-photo" src={imgRectangle1} />
                            </div>
                            <div className="figma-gallery-image">
                              <img alt="" className="figma-gallery-photo" src={imgRectangle2} />
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        className={`figma-bubble-stack ${
                          entry.kind === "user" ? "figma-bubble-stack-user" : "figma-bubble-stack-assistant"
                        }`}
                        key={`sample-${index}`}
                      >
                        <div
                          className={`figma-bubble ${
                            entry.kind === "user" ? "figma-bubble-user" : "figma-bubble-assistant"
                          }`}
                        >
                          <p className="figma-bubble-text">{entry.text}</p>
                        </div>
                      </div>
                    );
                  })}

                  <div className="figma-popup-menu" aria-hidden="true">
                    <div className="figma-popup-row">
                      <div className="figma-popup-icon">
                        <img alt="" className="figma-full-img" src={imgFrame7} />
                      </div>
                      <p className="figma-popup-text">Pin</p>
                    </div>
                    <div className="figma-popup-row">
                      <div className="figma-popup-icon">
                        <img alt="" className="figma-full-img" src={imgFrame8} />
                      </div>
                      <p className="figma-popup-text figma-popup-text-danger">Remove message</p>
                    </div>
                    <div className="figma-popup-row">
                      <div className="figma-popup-icon">
                        <img alt="" className="figma-full-img" src={imgFrame9} />
                      </div>
                      <p className="figma-popup-text figma-popup-text-danger">Delete message</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      className={`figma-bubble-stack ${
                        message.sender === "user" ? "figma-bubble-stack-user" : "figma-bubble-stack-assistant"
                      }`}
                      key={message.id}
                    >
                      <div
                        className={`figma-bubble ${
                          message.sender === "user" ? "figma-bubble-user" : "figma-bubble-assistant"
                        } ${message.pending ? "figma-bubble-pending" : ""}`}
                      >
                        <p className="figma-bubble-text">{message.text}</p>
                        {message.citations.length > 0 ? (
                          <div className="figma-citation-list">
                            {message.citations.map((citation) => (
                              <span className="figma-citation-chip" key={`${message.id}-${citation}`}>
                                {citation}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <form
              className="figma-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void handleQuestionSubmit();
              }}
            >
              <label className="sr-only" htmlFor="resource-question">
                Ask a question
              </label>
              <textarea
                className="figma-composer-input"
                id="resource-question"
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleQuestionSubmit();
                  }
                }}
                placeholder="Type a message"
                rows={1}
                value={question}
              />
              <button className="figma-send-button" type="submit">
                <div className="figma-send-icon">
                  <img alt="" className="figma-full-img" src={imgFrame5} />
                </div>
                <span className="sr-only">Ask ReSource</span>
              </button>
            </form>

            {chatError ? <p className="figma-hidden-status">{chatError}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
