"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  createConversation,
  fetchConversation,
  fetchConversations,
  fetchDocuments,
  getDocumentFileUrl,
  sendMessage,
  updateConversationDocuments,
  uploadDocument,
} from "@/lib/api";
import type { ChatMessage, ConversationSummary, DocumentSummary, PendingMessage } from "@/lib/types";

type StageMode = "chat" | "preview";
type ThreadMessage = ChatMessage | PendingMessage;
type MessageBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet-list"; items: string[] }
  | { type: "number-list"; items: string[] }
  | { type: "quote"; text: string };

function describeError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function readConversationIdFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.location.search
    ? new URLSearchParams(window.location.search).get("conversationId")
    : null;

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function replaceConversationInUrl(conversationId: number | null) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (conversationId === null) {
    url.searchParams.delete("conversationId");
  } else {
    url.searchParams.set("conversationId", String(conversationId));
  }

  window.history.replaceState({}, "", url.toString());
}

function sortConversations(conversations: ConversationSummary[]) {
  return [...conversations].sort((left, right) => {
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 KB";
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatRelativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const hour = 1000 * 60 * 60;
  const day = hour * 24;
  const week = day * 7;

  if (delta < hour) {
    const hours = Math.max(1, Math.round(delta / hour));
    return `Updated ${hours}h ago`;
  }

  if (delta < day) {
    const hours = Math.max(1, Math.round(delta / hour));
    return `Updated ${hours}h ago`;
  }

  if (delta < day * 2) {
    return "Updated yesterday";
  }

  if (delta < week) {
    return `Updated ${Math.max(1, Math.round(delta / day))}d ago`;
  }

  return `Updated ${Math.max(1, Math.round(delta / week))}w ago`;
}

function formatStageTitle(conversation: ConversationSummary | null) {
  if (!conversation) {
    return "New conversation";
  }

  return conversation.title.trim() || "New conversation";
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={`${part}-${index}`} className="font-semibold text-on-surface">
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={`${part}-${index}`}
            className="rounded-md bg-surface px-1.5 py-0.5 font-['IBM_Plex_Mono',monospace] text-[0.92em] text-primary"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
}

function parseMessageBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let paragraphLines: string[] = [];
  let bulletItems: string[] = [];
  let numberedItems: string[] = [];

  function flushParagraph() {
    if (!paragraphLines.length) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" ").trim(),
    });
    paragraphLines = [];
  }

  function flushBulletList() {
    if (!bulletItems.length) {
      return;
    }

    blocks.push({ type: "bullet-list", items: bulletItems });
    bulletItems = [];
  }

  function flushNumberedList() {
    if (!numberedItems.length) {
      return;
    }

    blocks.push({ type: "number-list", items: numberedItems });
    numberedItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushBulletList();
      flushNumberedList();
      continue;
    }

    const headingMatch = /^(#{2,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushBulletList();
      flushNumberedList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length === 2 ? 2 : 3,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      flushParagraph();
      flushNumberedList();
      bulletItems.push(bulletMatch[1].trim());
      continue;
    }

    const numberedMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (numberedMatch) {
      flushParagraph();
      flushBulletList();
      numberedItems.push(numberedMatch[1].trim());
      continue;
    }

    const quoteMatch = /^>\s+(.+)$/.exec(line);
    if (quoteMatch) {
      flushParagraph();
      flushBulletList();
      flushNumberedList();
      blocks.push({ type: "quote", text: quoteMatch[1].trim() });
      continue;
    }

    flushBulletList();
    flushNumberedList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushBulletList();
  flushNumberedList();

  return blocks;
}

function RichMessageContent({ text }: { text: string }) {
  const blocks = useMemo(() => parseMessageBlocks(text), [text]);

  return (
    <div className="space-y-3.5 text-[15px] leading-7 text-on-surface-variant">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const HeadingTag = block.level === 2 ? "h3" : "h4";
          const sizeClass = block.level === 2 ? "text-lg" : "text-base";

          return (
            <HeadingTag
              key={`${block.type}-${index}`}
              className={`${sizeClass} font-semibold tracking-[-0.02em] text-on-surface`}
            >
              {renderInlineMarkdown(block.text)}
            </HeadingTag>
          );
        }

        if (block.type === "bullet-list") {
          return (
            <ul key={`${block.type}-${index}`} className="space-y-2 pl-5 text-on-surface-variant">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className="list-disc pl-1">
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "number-list") {
          return (
            <ol key={`${block.type}-${index}`} className="space-y-2 pl-5 text-on-surface-variant">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className="list-decimal pl-1">
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={`${block.type}-${index}`}
              className="border-l-2 border-primary/18 pl-4 text-sm italic text-on-surface-variant"
            >
              {renderInlineMarkdown(block.text)}
            </blockquote>
          );
        }

        return (
          <p key={`${block.type}-${index}`} className="text-on-surface-variant">
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function MaterialIcon({
  icon,
  className,
  filled = false,
}: {
  icon: string;
  className?: string;
  filled?: boolean;
}) {
  const sharedProps = {
    className,
    viewBox: "0 0 24 24",
    width: "1em",
    height: "1em",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { display: "block" },
    "aria-hidden": true,
  };

  switch (icon) {
    case "architecture":
      return (
        <svg {...sharedProps}>
          <path d="M12 3 7 5v4c0 4.5 1.8 8.2 5 10 3.2-1.8 5-5.5 5-10V5l-5-2Z" fill="currentColor" stroke="none" />
          <path d="M10 11h4M12 8v8" stroke={filled ? "#4338ca" : "white"} />
        </svg>
      );
    case "add":
      return (
        <svg {...sharedProps}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "upload_file":
      return (
        <svg {...sharedProps}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
          <path d="M14 3v5h5" />
          <path d="M12 17V10" />
          <path d="m9.5 12.5 2.5-2.5 2.5 2.5" />
        </svg>
      );
    case "chat_bubble":
      return (
        <svg {...sharedProps}>
          <path d="M6 18.5 3.5 20V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6Z" />
        </svg>
      );
    case "description":
      return (
        <svg {...sharedProps}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h6M9 9h2" />
        </svg>
      );
    case "close":
      return (
        <svg {...sharedProps}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "person":
      return (
        <svg {...sharedProps}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "auto_awesome":
      return (
        <svg {...sharedProps}>
          <path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3L7.5 7.5l3.3-1.2Z" fill="currentColor" stroke="none" />
          <path d="m18 13 .7 1.8 1.8.7-1.8.7L18 18l-.7-1.8-1.8-.7 1.8-.7ZM6 14l.9 2.3 2.3.9-2.3.9L6 20l-.9-2.3-2.3-.9 2.3-.9Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "attach_file":
      return (
        <svg {...sharedProps}>
          <path d="m15.5 8.5-5.7 5.7a3 3 0 1 0 4.2 4.2l6.4-6.4a4.5 4.5 0 0 0-6.4-6.4L7 12.6" />
        </svg>
      );
    case "send":
      return (
        <svg {...sharedProps}>
          <path d="M3 20 21 12 3 4l2.5 6L14 12l-8.5 2Z" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <span
          className={`material-symbols-outlined ${className ?? ""}`.trim()}
          style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
          aria-hidden="true"
        >
          {icon}
        </span>
      );
  }
}

function ConversationNav({
  conversations,
  selectedConversationId,
  onSelect,
}: {
  conversations: ConversationSummary[];
  selectedConversationId: number | null;
  onSelect: (conversationId: number) => void;
}) {
  return (
    <nav className="space-y-1 overflow-y-auto max-h-full no-scrollbar">
      {conversations.map((conversation) => {
        const isActive = conversation.id === selectedConversationId;

        return (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation.id)}
            className={
              isActive
                ? "flex w-full cursor-pointer items-center gap-3 rounded-md bg-primary/10 p-2.5 text-left font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/12 hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
                : "flex w-full cursor-pointer items-center gap-3 rounded-md p-2.5 text-left text-on-surface-variant transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container-low hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10"
            }
            aria-pressed={isActive}
            aria-label={conversation.title}
          >
            <MaterialIcon icon="chat_bubble" className="text-[18px]" />
            <span className="truncate text-xs">{conversation.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

function DocumentLibrary({
  documents,
  previewDocumentId,
  onSelect,
}: {
  documents: DocumentSummary[];
  previewDocumentId: number | null;
  onSelect: (documentId: number) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto space-y-1 pr-2">
      {documents.map((document) => {
        const isActive = document.id === previewDocumentId;

        return (
          <button
            key={document.id}
            type="button"
            onClick={() => onSelect(document.id)}
            className={
              isActive
                ? "group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-primary/20 bg-white p-3 text-left text-on-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
                : "group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent p-3 text-left text-on-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-outline-variant/30 hover:bg-surface hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10"
            }
            aria-label={document.filename}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <MaterialIcon icon="description" className="text-[20px]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold">{document.filename}</p>
                <p className="text-[9px] font-medium text-on-surface-variant">
                  {formatFileSize(document.file_size)} · {formatRelativeTime(document.upload_date)}
                </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ActiveContext({
  documents,
  availableDocuments,
  onRemove,
  onAdd,
  isPickerOpen,
  onTogglePicker,
}: {
  documents: DocumentSummary[];
  availableDocuments: DocumentSummary[];
  onRemove: (documentId: number) => void;
  onAdd: (documentId: number) => void;
  isPickerOpen: boolean;
  onTogglePicker: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-12 pb-4">
      {documents.map((document) => (
        <div
          key={document.id}
          className="flex items-center gap-2 rounded-lg border border-outline-variant/30 bg-white px-3 py-2 shadow-sm"
        >
          <MaterialIcon icon="description" className="text-[18px] text-primary" />
          <span className="text-[11px] font-semibold text-on-surface">[PDF] {document.filename}</span>
          <button
            type="button"
            onClick={() => onRemove(document.id)}
            className="ml-1 cursor-pointer rounded-full p-1 transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-50 hover:text-red-500 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
            aria-label={`Remove ${document.filename}`}
          >
            <MaterialIcon icon="close" className="text-[14px]" />
          </button>
        </div>
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={onTogglePicker}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-outline-variant text-on-surface-variant transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 hover:text-primary hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10"
          aria-label="+"
        >
          <MaterialIcon icon="add" className="text-[18px]" />
        </button>
        {isPickerOpen ? (
          <div className="absolute left-0 top-11 z-30 w-72 rounded-2xl border border-outline-variant/60 bg-white p-2 shadow-xl">
            {availableDocuments.length ? (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {availableDocuments.map((document) => (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => onAdd(document.id)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container-low hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10"
                    aria-label={document.filename}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                      <MaterialIcon icon="description" className="text-[20px]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-on-surface">{document.filename}</p>
                      <p className="text-[9px] font-medium text-on-surface-variant">
                        {formatFileSize(document.file_size)} · {formatRelativeTime(document.upload_date)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-4 text-xs text-on-surface-variant">All PDFs are already in active context.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: ThreadMessage }) {
  return (
    <div className="flex items-start gap-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-secondary/25 bg-secondary-container shadow-[0_4px_16px_rgba(181,164,109,0.12)]">
        <MaterialIcon icon="person" className="text-[1.25rem] text-primary" />
      </div>
      <div className="flex-1 rounded-[1.75rem] border border-secondary/30 bg-white/75 px-6 py-5 shadow-[0_10px_30px_rgba(34,36,38,0.04)]">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/55">
          You asked
        </p>
        <p className="text-[15px] font-medium leading-7 text-on-surface">{message.text}</p>
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: ThreadMessage }) {
  const citations = "citations" in message ? message.citations : [];
  const isPending = "pending" in message && Boolean(message.pending);
  const isNotFound = message.text.trim().toLowerCase().startsWith("not found in the uploaded context");
  const cardClassName = isNotFound
    ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.94),rgba(255,255,255,0.98))] shadow-[0_14px_34px_rgba(217,119,6,0.08)]"
    : "border-outline-variant/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,247,242,0.82))] shadow-[0_18px_40px_rgba(34,36,38,0.06)]";
  const badgeClassName = isNotFound ? "bg-amber-100 text-amber-800" : "bg-primary/8 text-primary";

  return (
    <div className="flex items-start gap-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary shadow-[0_10px_24px_rgba(67,56,202,0.22)] ring-4 ring-primary-container/55">
        <MaterialIcon icon="auto_awesome" className="text-[1.1rem] text-white" filled />
      </div>
      <div className={`flex-1 rounded-[1.9rem] border p-6 ${cardClassName}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${badgeClassName}`}>
              {isNotFound ? "Context Gap" : "Grounded Answer"}
            </span>
            {isPending ? (
              <span className="text-[11px] font-medium text-on-surface-variant/70">Drafting response...</span>
            ) : null}
          </div>
          {citations.length ? (
            <span className="text-[11px] font-medium text-on-surface-variant/55">
              {citations.length} source{citations.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <RichMessageContent text={message.text} />

        {citations.length ? (
          <div className="mt-5 border-t border-outline-variant/35 pt-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant/55">
              Sources
            </p>
            <div className="flex flex-wrap gap-2">
              {citations.map((citation) => (
                <div
                  key={citation}
                  className="flex w-fit items-center gap-2 rounded-xl border border-outline-variant/20 bg-white/80 px-3 py-2"
                >
                  <MaterialIcon icon="description" className="text-sm text-primary" />
                  <span className="text-[11px] font-semibold text-on-surface-variant">{citation}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatStage({
  title,
  messages,
  loading,
}: {
  title: string;
  messages: ThreadMessage[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-on-surface-variant">
        Loading {title.toLowerCase()}...
      </div>
    );
  }

  if (!messages.length) {
    return (
      <div className="py-20 text-center">
        <h2 className="mb-2 text-2xl font-semibold tracking-[-0.01em] text-on-surface">{title}</h2>
        <p className="text-sm leading-relaxed text-on-surface-variant">
          Start a new conversation or upload PDFs to build the active context.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {messages.map((message) =>
        message.sender === "user" ? (
          <UserMessage key={String(message.id)} message={message} />
        ) : (
          <AssistantMessage key={String(message.id)} message={message} />
        ),
      )}
    </div>
  );
}

function PreviewStage({ document }: { document: DocumentSummary }) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-outline-variant/40 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-on-surface">{document.filename}</h2>
        <p className="mt-2 text-sm text-on-surface-variant">
          PDF preview · {formatFileSize(document.file_size)} · {formatRelativeTime(document.upload_date)}
        </p>
      </div>
      <div className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-white shadow-sm">
        <iframe
          title={`Preview of ${document.filename}`}
          src={getDocumentFileUrl(document.id)}
          className="h-[calc(100vh-21rem)] min-h-[36rem] w-full bg-surface-container-low"
        />
      </div>
    </div>
  );
}

export default function ResourceWorkspace() {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const initializedRef = useRef(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [activeDocuments, setActiveDocuments] = useState<DocumentSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stageMode, setStageMode] = useState<StageMode>("chat");
  const [previewDocumentId, setPreviewDocumentId] = useState<number | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const previewDocument = useMemo(
    () => documents.find((document) => document.id === previewDocumentId) ?? null,
    [documents, previewDocumentId],
  );
  const availableDocuments = useMemo(() => {
    const activeIds = new Set(activeDocuments.map((document) => document.id));
    return documents.filter((document) => !activeIds.has(document.id));
  }, [activeDocuments, documents]);

  async function loadConversation(conversationId: number) {
    const detail = await fetchConversation(conversationId);
    setSelectedConversationId(detail.conversation.id);
    setMessages(detail.messages);
    setActiveDocuments(detail.active_documents);
    setConversations((current) =>
      sortConversations(
        current.some((conversation) => conversation.id === detail.conversation.id)
          ? current.map((conversation) =>
              conversation.id === detail.conversation.id ? detail.conversation : conversation,
            )
          : [...current, detail.conversation],
      ),
    );
    replaceConversationInUrl(detail.conversation.id);
  }

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    void (async () => {
      try {
        const [loadedDocuments, loadedConversations] = await Promise.all([
          fetchDocuments(),
          fetchConversations(),
        ]);
        const pdfs = loadedDocuments.filter((document) => document.filename.toLowerCase().endsWith(".pdf"));
        const sorted = sortConversations(loadedConversations);
        setDocuments(pdfs);
        setConversations(sorted);

        let conversationId = readConversationIdFromUrl();
        if (!conversationId || !sorted.some((conversation) => conversation.id === conversationId)) {
          if (sorted.length) {
            conversationId = sorted[0].id;
          } else {
            const detail = await createConversation();
            setConversations([detail.conversation]);
            setSelectedConversationId(detail.conversation.id);
            setMessages(detail.messages);
            setActiveDocuments(detail.active_documents);
            replaceConversationInUrl(detail.conversation.id);
            setIsBootstrapping(false);
            return;
          }
        }

        await loadConversation(conversationId);
      } catch (error) {
        setErrorMessage(describeError(error));
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, []);

  async function handleSelectConversation(conversationId: number) {
    setErrorMessage(null);
    setStatusMessage(null);
    setStageMode("chat");
    setPreviewDocumentId(null);
    setIsPickerOpen(false);

    try {
      await loadConversation(conversationId);
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  async function handleCreateConversation() {
    setErrorMessage(null);
    setStatusMessage(null);
    setStageMode("chat");
    setPreviewDocumentId(null);
    setIsPickerOpen(false);

    try {
      const detail = await createConversation();
      setConversations((current) => sortConversations([detail.conversation, ...current]));
      setSelectedConversationId(detail.conversation.id);
      setMessages(detail.messages);
      setActiveDocuments(detail.active_documents);
      replaceConversationInUrl(detail.conversation.id);
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  function openUploadPicker() {
    uploadInputRef.current?.click();
  }

  async function handleUploadSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMessage("Only PDF uploads are supported.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(`Uploading ${file.name}...`);
    setIsUploading(true);

    try {
      let conversationId = selectedConversationId;
      if (!conversationId) {
        const detail = await createConversation();
        conversationId = detail.conversation.id;
        setConversations((current) => sortConversations([detail.conversation, ...current]));
        setSelectedConversationId(detail.conversation.id);
        setMessages(detail.messages);
        setActiveDocuments(detail.active_documents);
        replaceConversationInUrl(detail.conversation.id);
      }

      const result = await uploadDocument(file);
      const nextDocuments = [result.document, ...documents].sort((left, right) => right.id - left.id);
      setDocuments(nextDocuments);

      const nextIds = [...new Set([...activeDocuments.map((document) => document.id), result.document.id])];
      const updatedActiveDocuments = await updateConversationDocuments(conversationId, nextIds);
      setActiveDocuments(updatedActiveDocuments);

      const refreshedConversation = await fetchConversation(conversationId);
      setMessages(refreshedConversation.messages);
      setConversations((current) =>
        sortConversations(
          current.map((conversation) =>
            conversation.id === refreshedConversation.conversation.id
              ? refreshedConversation.conversation
              : conversation,
          ),
        ),
      );

      setStageMode("preview");
      setPreviewDocumentId(result.document.id);
      setStatusMessage(`${result.document.filename} uploaded.`);
    } catch (error) {
      setErrorMessage(describeError(error));
      setStatusMessage(null);
    } finally {
      setIsUploading(false);
    }
  }

  async function syncActiveDocuments(documentIds: number[]) {
    if (!selectedConversationId) {
      return;
    }

    const nextActiveDocuments = await updateConversationDocuments(selectedConversationId, documentIds);
    setActiveDocuments(nextActiveDocuments);
    const detail = await fetchConversation(selectedConversationId);
    setMessages(detail.messages);
    setConversations((current) =>
      sortConversations(
        current.map((conversation) =>
          conversation.id === detail.conversation.id ? detail.conversation : conversation,
        ),
      ),
    );
  }

  async function handleAddContextDocument(documentId: number) {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsPickerOpen(false);

    try {
      const nextIds = [...new Set([...activeDocuments.map((document) => document.id), documentId])];
      await syncActiveDocuments(nextIds);
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  async function handleRemoveContextDocument(documentId: number) {
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const nextIds = activeDocuments
        .map((document) => document.id)
        .filter((currentDocumentId) => currentDocumentId !== documentId);
      await syncActiveDocuments(nextIds);
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  async function submitCurrentDraft() {
    const question = draft.trim();
    if (!question) {
      return;
    }

    if (!selectedConversationId) {
      setErrorMessage("Create a conversation before sending a message.");
      return;
    }

    if (!activeDocuments.length) {
      setErrorMessage("Add at least one PDF to active context before sending a message.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setStageMode("chat");
    setPreviewDocumentId(null);
    setIsSending(true);

    const optimisticUser: PendingMessage = {
      id: makeId("user"),
      sender: "user",
      text: question,
      citations: [],
    };
    const optimisticAssistant: PendingMessage = {
      id: makeId("assistant"),
      sender: "assistant",
      text: "Analyzing the active PDFs...",
      citations: [],
      pending: true,
    };

    setDraft("");
    setMessages((current) => [...current, optimisticUser, optimisticAssistant]);

    try {
      const result = await sendMessage(selectedConversationId, question);
      setMessages((current) =>
        current
          .filter((message) => message.id !== optimisticUser.id && message.id !== optimisticAssistant.id)
          .concat(result.user_message, result.assistant_message),
      );
      setConversations((current) =>
        sortConversations(
          current.map((conversation) =>
            conversation.id === result.conversation.id ? result.conversation : conversation,
          ),
        ),
      );
    } catch (error) {
      const message = describeError(error);
      setErrorMessage(message);
      setMessages((current) =>
        current
          .filter((entry) => entry.id !== optimisticUser.id && entry.id !== optimisticAssistant.id)
          .concat(optimisticUser, {
            id: makeId("assistant-error"),
            sender: "assistant",
            text: message,
            citations: [],
          }),
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCurrentDraft();
  }

  async function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();

    if (isSending || isBootstrapping) {
      return;
    }

    await submitCurrentDraft();
  }

  const stageTitle = formatStageTitle(selectedConversation);

  return (
    <div className="overflow-hidden bg-surface text-on-surface">
      <input
        ref={uploadInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={handleUploadSelection}
        aria-label="Choose PDF file"
      />
      <aside className="fixed left-0 top-0 z-20 flex h-screen w-80 flex-col bg-surface-container px-6 py-8 font-['Inter'] antialiased tracking-tight">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <MaterialIcon icon="architecture" className="text-lg" filled />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-on-surface">ReSource</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
              Digital Atelier
            </p>
          </div>
        </div>
        <div className="mb-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCreateConversation}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-white shadow-lg shadow-primary/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(67,56,202,0.24)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            <MaterialIcon icon="add" className="text-sm" />
            <span className="text-sm">New Chat</span>
          </button>
          <button
            type="button"
            onClick={openUploadPicker}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-primary/10 bg-secondary/10 px-4 py-3 font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-secondary/15 hover:shadow-sm active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
            aria-label="Upload PDF"
          >
            <MaterialIcon icon="upload_file" className="text-sm" />
            <span className="text-sm">{isUploading ? "Uploading..." : "Upload"}</span>
          </button>
        </div>
        <div className="mb-6 h-[15%] min-h-[120px] overflow-hidden">
          <label className="mb-3 block px-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
            Recent Conversations
          </label>
          <ConversationNav
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelect={handleSelectConversation}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col border-t border-outline-variant/30 pt-6">
          <div className="mb-4 flex items-center justify-between px-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
              Document Library
            </label>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {documents.length} Files
            </span>
          </div>
          <DocumentLibrary
            documents={documents}
            previewDocumentId={previewDocumentId}
            onSelect={(documentId) => {
              setStageMode("preview");
              setPreviewDocumentId(documentId);
            }}
          />
        </div>
      </aside>
      <main className="relative ml-80 flex h-screen flex-col bg-surface">
        <header className="z-10 flex w-full flex-col border-b border-outline-variant/30 bg-surface-container-low">
          <div className="flex h-14 items-center justify-between px-12">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/50">
                Active Context
              </span>
            </div>
            <div aria-hidden="true" />
          </div>
          <ActiveContext
            documents={activeDocuments}
            availableDocuments={availableDocuments}
            onRemove={handleRemoveContextDocument}
            onAdd={handleAddContextDocument}
            isPickerOpen={isPickerOpen}
            onTogglePicker={() => setIsPickerOpen((current) => !current)}
          />
        </header>
        <section className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-12 py-10">
          {errorMessage ? (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}
          {statusMessage ? (
            <div className="mb-6 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-primary">
              {statusMessage}
            </div>
          ) : null}
          {stageMode === "preview" && previewDocument ? (
            <PreviewStage document={previewDocument} />
          ) : (
            <ChatStage title={stageTitle} messages={messages} loading={isBootstrapping} />
          )}
        </section>
        {stageMode === "chat" ? (
          <footer className="bg-surface px-12 pb-10 pt-0">
            <div className="mx-auto max-w-4xl">
              <form
                onSubmit={handleSendMessage}
                className="mb-0 overflow-hidden rounded-3xl border border-outline-variant/45 bg-surface-container-lowest shadow-[0_8px_24px_rgba(25,28,30,0.06)]"
              >
                <div className="flex items-center gap-3 p-5">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Ask about the active PDFs..."
                    rows={1}
                    className="min-h-12 flex-1 cursor-text resize-none border-none bg-surface-container-lowest px-1 py-3 text-[15px] leading-6 text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isSending || isBootstrapping}
                      className="flex h-11 w-11 cursor-pointer flex-none items-center justify-center self-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-[0_14px_28px_rgba(67,56,202,0.34)] active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                      aria-label="Send message"
                    >
                      <MaterialIcon icon="send" filled />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </footer>
        ) : null}
      </main>
    </div>
  );
}
