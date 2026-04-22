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
  deleteConversation,
  deleteDocument,
  fetchConversation,
  fetchConversations,
  fetchDocuments,
  getDocumentFileUrl,
  sendMessage,
  updateConversationDocuments,
  uploadDocument,
} from "@/lib/api";
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  DocumentSummary,
  PendingMessage,
} from "@/lib/types";

type StageMode = "chat" | "preview";
type ThreadMessage = ChatMessage | PendingMessage;
type ConversationSelection = number | typeof SHOWCASE_CHAT_ID | null;
type WorkspaceTheme = "light" | "dark";
type ResourceWorkspaceMode = "default" | "thumbnail-preview";
type ShowcaseStageVariant = "workspace" | "thumbnail";
type MessageBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet-list"; items: string[] }
  | { type: "number-list"; items: string[] }
  | { type: "quote"; text: string };
type ShowcaseScopeDocument = {
  filename: string;
  tone: "regulatory" | "internal";
};
type ComplianceTone = "high" | "medium" | "compliant";
type ComplianceSection = {
  title: string;
  status: string;
  tone: ComplianceTone;
  items: string[];
};
type AnalysisReplayState = {
  composerText: string;
  isComposerTyping: boolean;
  showComposerCaret: boolean;
  isSubmitting: boolean;
  hasSubmitted: boolean;
  userText: string;
  showUserMessage: boolean;
  showThinking: boolean;
  assistantVisible: boolean;
  titleText: string;
  subtitleText: string;
  visibleSectionCount: number;
  isGenerating: boolean;
};

const SHOWCASE_CHAT_ID = "analysis";
const SHOWCASE_CHAT_TITLE = "Analysis";
const SIDEBAR_STORAGE_KEY = "resource-workspace-sidebar-collapsed";
const THEME_STORAGE_KEY = "resource-workspace-theme";
const SHOWCASE_COMPOSER_START_DELAY_MS = 260;
const SHOWCASE_PRE_SUBMIT_DELAY_MS = 2000;
const SHOWCASE_SUBMIT_CLICK_DELAY_MS = 280;
const SHOWCASE_SUBMIT_CLEAR_DELAY_MS = 180;
const SHOWCASE_ASSISTANT_START_DELAY_MS = 2000;
const SHOWCASE_SECTION_INITIAL_DELAY_MS = 320;
const SHOWCASE_SECTION_STEP_MS = 2300;
const SHOWCASE_REPLAY_START_DELAY_MS = 2000;
const SHOWCASE_CHAT_QUESTION =
  "What are the critical risks and compliance implications highlighted within these documents?";
const SHOWCASE_SCOPE_DOCUMENTS: ShowcaseScopeDocument[] = [
  { filename: "regulatory_framework.pdf", tone: "regulatory" },
  { filename: "internal_audit_v1.pdf", tone: "internal" },
];
const SHOWCASE_COMPLIANCE_SECTIONS: ComplianceSection[] = [
  {
    title: "I. DATA SOVEREIGNTY VIOLATION",
    status: "HIGH RISK",
    tone: "high",
    items: [
      "Identified unauthorized cross-border data transfers in `internal_audit_v1.pdf` (Section 4.2).",
      "Non-compliance with GDPR Article 44 regarding secure transfer protocols.",
      "Immediate remediation required to avoid Tier 2 regulatory penalties.",
    ],
  },
  {
    title: "II. AUTHENTICATION REDUNDANCY",
    status: "MEDIUM RISK",
    tone: "medium",
    items: [
      "Legacy OAuth 1.0 protocols still active alongside modern implementations.",
      "Documentation lacks clear sunsetting dates for deprecated auth endpoints.",
      "Potential surface area for credential harvesting during fallback flows.",
    ],
  },
  {
    title: "III. POLICY ALIGNMENT",
    status: "COMPLIANT",
    tone: "compliant",
    items: [
      "Encryption standards meet or exceed FIPS 140-2 requirements.",
      "Audit logging coverage is sufficient for quarterly regulatory reporting cycles.",
    ],
  },
];

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

function isRealConversationId(value: ConversationSelection): value is number {
  return typeof value === "number";
}

function getPreferredTheme(): WorkspaceTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "light";
}

function getPreferredSidebarState() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

function confirmDestructiveAction(message: string) {
  if (typeof window === "undefined") {
    return true;
  }

  return window.confirm(message);
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

function createCompletedAnalysisReplayState(): AnalysisReplayState {
  return {
    composerText: "",
    isComposerTyping: false,
    showComposerCaret: false,
    isSubmitting: false,
    hasSubmitted: true,
    userText: SHOWCASE_CHAT_QUESTION,
    showUserMessage: true,
    showThinking: false,
    assistantVisible: true,
    titleText: "Executive Compliance Summary",
    subtitleText: "Review Portal Output",
    visibleSectionCount: SHOWCASE_COMPLIANCE_SECTIONS.length,
    isGenerating: false,
  };
}

function createInitialAnalysisReplayState(): AnalysisReplayState {
  return {
    composerText: "",
    isComposerTyping: false,
    showComposerCaret: false,
    isSubmitting: false,
    hasSubmitted: false,
    userText: "",
    showUserMessage: false,
    showThinking: false,
    assistantVisible: false,
    titleText: "",
    subtitleText: "",
    visibleSectionCount: 0,
    isGenerating: false,
  };
}

function getShowcaseTypingDelay(text: string, index: number) {
  const character = text[index] ?? "";

  if (!character) {
    return 64;
  }

  if (character === " ") {
    return 34 + ((index * 11) % 16);
  }

  if (/[,.!?]/.test(character)) {
    return 170 + ((index * 17) % 90);
  }

  if (/[:;]/.test(character)) {
    return 130 + ((index * 13) % 70);
  }

  if (/[-/]/.test(character)) {
    return 110 + ((index * 19) % 50);
  }

  return 42 + ((index * 29 + character.charCodeAt(0)) % 52);
}

function useWordReveal(text: string, animate: boolean, startDelay = 0, wordDelay = 82) {
  const [value, setValue] = useState(() => (animate ? "" : text));

  useEffect(() => {
    if (!animate) {
      setValue(text);
      return;
    }

    const words = text.split(/(\s+)/).filter(Boolean);
    if (!words.length) {
      setValue("");
      return;
    }

    setValue("");
    let index = 0;
    let intervalId: number | null = null;

    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        index += 1;
        setValue(words.slice(0, index).join(""));

        if (index >= words.length && intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, wordDelay);
    }, startDelay);

    return () => {
      window.clearTimeout(timeoutId);

      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [animate, startDelay, text, wordDelay]);

  return value;
}

function useAnalysisReplay(play: boolean, playbackKey: number) {
  const [state, setState] = useState<AnalysisReplayState>(createInitialAnalysisReplayState);

  useEffect(() => {
    if (!play) {
      setState(createInitialAnalysisReplayState());
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    const updateState = (partial: Partial<AnalysisReplayState>) => {
      if (cancelled) {
        return;
      }

      setState((current) => ({ ...current, ...partial }));
    };

    const schedule = (callback: () => void, delay: number) => {
      const timerId = window.setTimeout(() => {
        if (!cancelled) {
          callback();
        }
      }, delay);
      timers.push(timerId);
      return timerId;
    };

    const typeText = (
      text: string,
      onUpdate: (value: string) => void,
      onComplete?: () => void,
      startDelay = 0,
    ) => {
      let index = 0;

      const step = () => {
        if (cancelled) {
          return;
        }

        index += 1;
        onUpdate(text.slice(0, index));

        if (index >= text.length) {
          onComplete?.();
          return;
        }

        schedule(step, getShowcaseTypingDelay(text, index - 1));
      };

      schedule(step, startDelay);
    };

    const revealSections = () => {
      let visibleCount = 0;

      const step = () => {
        if (cancelled) {
          return;
        }

        visibleCount += 1;
        updateState({ visibleSectionCount: Math.min(visibleCount, SHOWCASE_COMPLIANCE_SECTIONS.length) });

        if (visibleCount >= SHOWCASE_COMPLIANCE_SECTIONS.length) {
          updateState({ isGenerating: false });
          return;
        }

        schedule(step, SHOWCASE_SECTION_STEP_MS);
      };

      schedule(step, SHOWCASE_SECTION_INITIAL_DELAY_MS);
    };

    setState(createInitialAnalysisReplayState());

    schedule(() => {
      updateState({
        isComposerTyping: true,
        showComposerCaret: true,
      });

      typeText(
        SHOWCASE_CHAT_QUESTION,
        (value) => {
          updateState({
            composerText: value,
            isComposerTyping: value !== SHOWCASE_CHAT_QUESTION,
            showComposerCaret: true,
          });
        },
        () => {
          updateState({
            composerText: SHOWCASE_CHAT_QUESTION,
            isComposerTyping: false,
            showComposerCaret: true,
          });

          schedule(() => {
            updateState({
              isSubmitting: true,
              showComposerCaret: false,
            });
          }, SHOWCASE_PRE_SUBMIT_DELAY_MS + SHOWCASE_SUBMIT_CLICK_DELAY_MS);

          schedule(() => {
            updateState({
              composerText: "",
              isSubmitting: false,
              showComposerCaret: false,
              hasSubmitted: true,
              showUserMessage: true,
              userText: SHOWCASE_CHAT_QUESTION,
              showThinking: true,
            });

            schedule(() => {
              updateState({
                showThinking: false,
                assistantVisible: true,
                isGenerating: true,
                titleText: "Executive Compliance Summary",
                subtitleText: "Review Portal Output",
              });
              revealSections();
            }, SHOWCASE_ASSISTANT_START_DELAY_MS);
          }, SHOWCASE_PRE_SUBMIT_DELAY_MS + SHOWCASE_SUBMIT_CLICK_DELAY_MS + SHOWCASE_SUBMIT_CLEAR_DELAY_MS);
        },
        SHOWCASE_COMPOSER_START_DELAY_MS,
      );
    }, SHOWCASE_REPLAY_START_DELAY_MS);

    return () => {
      cancelled = true;
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [play, playbackKey]);

  return play ? state : createCompletedAnalysisReplayState();
}

function useMountTransition(animate: boolean) {
  const [entered, setEntered] = useState(() => !animate);

  useEffect(() => {
    if (!animate) {
      setEntered(true);
      return;
    }

    setEntered(false);
    const timeoutId = window.setTimeout(() => {
      setEntered(true);
    }, 20);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [animate]);

  return entered;
}

function useShowcaseAutoScroll(replay?: AnalysisReplayState) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!replay) {
      return;
    }

    if (!replay.showUserMessage && !replay.showThinking && !replay.assistantVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "end",
      });
    }, 140);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [replay?.showUserMessage, replay?.showThinking, replay?.assistantVisible, replay?.visibleSectionCount]);

  return bottomRef;
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
    case "light_mode":
      return (
        <svg {...sharedProps}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6" />
        </svg>
      );
    case "dark_mode":
      return (
        <svg {...sharedProps}>
          <path d="M20 14.2A7.8 7.8 0 1 1 9.8 4 6.4 6.4 0 0 0 20 14.2Z" />
        </svg>
      );
    case "chevron_left":
      return (
        <svg {...sharedProps}>
          <path d="m15 18-6-6 6-6" />
        </svg>
      );
    case "chevron_right":
      return (
        <svg {...sharedProps}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "delete":
      return (
        <svg {...sharedProps}>
          <path d="M4 7h16" />
          <path d="M10 11v6M14 11v6" />
          <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
          <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
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
  onDelete,
  deletingConversationId,
}: {
  conversations: ConversationSummary[];
  selectedConversationId: ConversationSelection;
  onSelect: (conversationId: ConversationSelection) => void;
  onDelete: (conversation: ConversationSummary) => void;
  deletingConversationId: number | null;
}) {
  const isShowcaseActive = selectedConversationId === SHOWCASE_CHAT_ID;

  return (
    <nav className="space-y-1 overflow-y-auto max-h-full no-scrollbar">
      <button
        type="button"
        onClick={() => onSelect(SHOWCASE_CHAT_ID)}
        className={
          isShowcaseActive
            ? "flex w-full cursor-pointer items-center gap-3 rounded-md bg-primary/10 p-2.5 text-left font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/12 hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
            : "flex w-full cursor-pointer items-center gap-3 rounded-md p-2.5 text-left text-on-surface-variant transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container-low hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10"
        }
        aria-pressed={isShowcaseActive}
        aria-label={SHOWCASE_CHAT_TITLE}
      >
        <MaterialIcon icon="auto_awesome" className="text-[18px]" />
        <span className="truncate text-xs">{SHOWCASE_CHAT_TITLE}</span>
      </button>
      {conversations.map((conversation) => {
        const isActive = conversation.id === selectedConversationId;

        return (
          <div key={conversation.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={
                isActive
                  ? "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md bg-primary/10 p-2.5 text-left font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/12 hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
                  : "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md p-2.5 text-left text-on-surface-variant transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container-low hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10"
              }
              aria-pressed={isActive}
              aria-label={conversation.title}
            >
              <MaterialIcon icon="chat_bubble" className="text-[18px] shrink-0" />
              <span className="truncate text-xs">{conversation.title}</span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(conversation)}
              disabled={deletingConversationId === conversation.id}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-on-surface-variant transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--workspace-danger-soft)] hover:text-[var(--workspace-danger-text)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              aria-label={`Delete chat ${conversation.title}`}
              title={`Delete ${conversation.title}`}
            >
              <MaterialIcon icon="delete" className="text-[16px]" />
            </button>
          </div>
        );
      })}
    </nav>
  );
}

function DocumentLibrary({
  documents,
  previewDocumentId,
  onSelect,
  onDelete,
  deletingDocumentId,
}: {
  documents: DocumentSummary[];
  previewDocumentId: number | null;
  onSelect: (documentId: number) => void;
  onDelete: (document: DocumentSummary) => void;
  deletingDocumentId: number | null;
}) {
  return (
    <div className="flex-1 overflow-y-auto space-y-1 pr-2">
      {documents.map((document) => {
        const isActive = document.id === previewDocumentId;

        return (
          <div key={document.id} className="group flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(document.id)}
              className={
                isActive
                  ? "group flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-primary/20 bg-[var(--workspace-elevated)] p-3 text-left text-on-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
                  : "group flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-transparent p-3 text-left text-on-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-outline-variant/30 hover:bg-surface hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10"
              }
              aria-label={document.filename}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--workspace-danger-soft)] text-[var(--workspace-danger-text)]">
                <MaterialIcon icon="description" className="text-[20px]" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold">{document.filename}</p>
                <p className="text-[9px] font-medium text-on-surface-variant">
                  {formatFileSize(document.file_size)}
                  {" \u00b7 "}
                  {formatRelativeTime(document.upload_date)}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onDelete(document)}
              disabled={deletingDocumentId === document.id}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-on-surface-variant transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--workspace-danger-soft)] hover:text-[var(--workspace-danger-text)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              aria-label={`Delete document ${document.filename}`}
              title={`Delete ${document.filename}`}
            >
              <MaterialIcon icon="delete" className="text-[16px]" />
            </button>
          </div>
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
          className="flex items-center gap-2 rounded-lg border border-outline-variant/30 bg-[var(--workspace-elevated)] px-3 py-2 shadow-sm"
        >
          <MaterialIcon icon="description" className="text-[18px] text-primary" />
          <span className="text-[11px] font-semibold text-on-surface">[PDF] {document.filename}</span>
          <button
            type="button"
            onClick={() => onRemove(document.id)}
            className="ml-1 cursor-pointer rounded-full p-1 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--workspace-danger-soft)] hover:text-[var(--workspace-danger-text)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
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
          <div className="absolute left-0 top-11 z-30 w-72 rounded-2xl border border-outline-variant/60 bg-[var(--workspace-elevated)] p-2 shadow-xl">
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
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--workspace-danger-soft)] text-[var(--workspace-danger-text)]">
                      <MaterialIcon icon="description" className="text-[20px]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-on-surface">{document.filename}</p>
                      <p className="text-[9px] font-medium text-on-surface-variant">
                        {formatFileSize(document.file_size)}
                        {" \u00b7 "}
                        {formatRelativeTime(document.upload_date)}
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
      <div className="flex-1 rounded-[1.75rem] border border-secondary/30 bg-[var(--workspace-elevated-muted)] px-6 py-5 shadow-[0_10px_30px_rgba(34,36,38,0.04)]">
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
    ? "border-amber-200/80 bg-[linear-gradient(180deg,var(--workspace-warning-start),var(--workspace-warning-end))] shadow-[0_14px_34px_rgba(217,119,6,0.08)]"
    : "border-outline-variant/45 bg-[linear-gradient(180deg,var(--workspace-card-start),var(--workspace-card-end))] shadow-[0_18px_40px_rgba(34,36,38,0.06)]";
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
                  className="flex w-fit items-center gap-2 rounded-xl border border-outline-variant/20 bg-[var(--workspace-elevated-strong)] px-3 py-2"
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

function ShowcaseScopeChip({ document }: { document: ShowcaseScopeDocument }) {
  const toneClassName =
    document.tone === "regulatory"
      ? "border-primary/12 bg-[var(--workspace-elevated)] text-on-surface"
      : "border-outline-variant/30 bg-surface-container-low text-on-surface-variant";

  return (
    <div
      className={`flex items-center gap-3 rounded-[1.1rem] border px-4 py-3.5 shadow-[0_10px_24px_rgba(25,28,30,0.05)] ${toneClassName}`}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/8 text-primary">
        <MaterialIcon icon="description" className="text-[15px]" />
      </div>
      <span className="text-[14px] font-semibold tracking-[-0.01em]">{document.filename}</span>
      <MaterialIcon icon="close" className="text-[14px] text-on-surface-variant/55" />
    </div>
  );
}

function TypingCaret({ active }: { active: boolean }) {
  return active ? <span className="ml-1 inline-block animate-pulse text-primary">|</span> : null;
}

function ShowcaseAssistantLoader({ label }: { label: string }) {
  return (
    <div className="mb-8 rounded-[1.9rem] border border-outline-variant/30 bg-[linear-gradient(180deg,var(--workspace-elevated),rgba(255,255,255,0.72))] px-7 py-6 shadow-[0_18px_40px_rgba(25,28,30,0.06)]">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] bg-primary/10 text-primary">
          <MaterialIcon icon="auto_awesome" className="text-[20px]" filled />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-black uppercase tracking-[0.2em] text-primary/75">Thinking</p>
            <div className="flex items-center gap-1" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-2 w-2 animate-bounce rounded-full bg-primary/65"
                  style={{ animationDelay: `${index * 120}ms` }}
                />
              ))}
            </div>
          </div>
          <p className="truncate text-[17px] font-medium text-on-surface/72">{label}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3.5" aria-hidden="true">
        <div className="h-2.5 rounded-full bg-primary/8">
          <div className="h-2.5 w-[68%] animate-pulse rounded-full bg-primary/30" />
        </div>
        <div className="h-2.5 rounded-full bg-primary/8">
          <div className="h-2.5 w-[82%] animate-pulse rounded-full bg-primary/24" style={{ animationDelay: "140ms" }} />
        </div>
        <div className="h-2.5 rounded-full bg-primary/8">
          <div className="h-2.5 w-[54%] animate-pulse rounded-full bg-primary/18" style={{ animationDelay: "240ms" }} />
        </div>
      </div>
    </div>
  );
}

function StreamedMarkdownLine({
  text,
  animate,
  startDelay = 0,
  wordDelay = 82,
}: {
  text: string;
  animate: boolean;
  startDelay?: number;
  wordDelay?: number;
}) {
  const value = useWordReveal(text, animate, startDelay, wordDelay);
  return <>{renderInlineMarkdown(value)}</>;
}

function ComplianceRiskSection({
  section,
  animate = false,
  itemDelayBase = 0,
}: {
  section: ComplianceSection;
  animate?: boolean;
  itemDelayBase?: number;
}) {
  const entered = useMountTransition(animate);
  const toneClasses = {
    high: {
      accent: "bg-red-500",
      status: "text-red-500",
    },
    medium: {
      accent: "bg-amber-500",
      status: "text-amber-500",
    },
    compliant: {
      accent: "bg-emerald-500",
      status: "text-emerald-600",
    },
  }[section.tone];

  return (
    <div
      className={`relative px-10 py-6 transition-all duration-500 ${
        entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[8px] rounded-full ${toneClasses.accent}`} />
      <div className="pl-8">
        <div className="mb-5 flex flex-wrap items-baseline gap-4">
          <h3 className="text-[20px] font-black uppercase tracking-[0.01em] text-on-surface lg:text-[24px]">
            <StreamedMarkdownLine text={section.title} animate={animate} startDelay={40} wordDelay={88} />
          </h3>
          <span className="text-[20px] font-black text-on-surface/75 lg:text-[24px]" aria-hidden="true">
            {"\u2014"}
          </span>
          <span className={`text-[16px] font-black uppercase tracking-[0.08em] lg:text-[18px] ${toneClasses.status}`}>
            <StreamedMarkdownLine text={section.status} animate={animate} startDelay={180} wordDelay={110} />
          </span>
        </div>
        <ul className="space-y-4 pl-8 text-[20px] leading-10 text-on-surface-variant lg:text-[22px] lg:leading-[2.9rem]">
          {section.items.map((item, index) => (
            <li
              key={item}
              className={`list-disc pl-1 transition-all duration-500 ${
                entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
              style={animate ? { transitionDelay: `${itemDelayBase + index * 90}ms` } : undefined}
            >
              <StreamedMarkdownLine
                text={item}
                animate={animate}
                startDelay={280 + index * 220}
                wordDelay={78}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function WorkspaceBrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-[0_14px_28px_rgba(67,56,202,0.2)]">
        <MaterialIcon icon="architecture" className="text-[1.15rem]" filled />
      </div>
      <div>
        <h1 className={`${compact ? "text-lg" : "text-xl"} font-semibold tracking-[-0.01em] text-on-surface`}>
          ReSource
        </h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
          Digital Atelier
        </p>
      </div>
    </div>
  );
}

function ShowcaseQuestionCard() {
  return (
    <div className="rounded-[2rem] border border-secondary/28 bg-[var(--workspace-elevated)] p-6 shadow-[0_16px_36px_rgba(25,28,30,0.06)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-secondary/25 bg-secondary-container shadow-[0_8px_20px_rgba(181,164,109,0.12)]">
          <MaterialIcon icon="person" className="text-[18px] text-primary" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant/55">
            User Question
          </p>
          <p className="mt-2 text-[1.02rem] font-semibold leading-7 tracking-[-0.02em] text-on-surface">
            {SHOWCASE_CHAT_QUESTION}
          </p>
        </div>
      </div>
    </div>
  );
}

function ThumbnailQuestionCue() {
  return (
    <div className="rounded-[2.2rem] border border-secondary/22 bg-[var(--workspace-elevated)] px-7 py-7 shadow-[0_20px_42px_rgba(25,28,30,0.065)]">
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full border border-secondary/25 bg-secondary-container shadow-[0_11px_24px_rgba(181,164,109,0.15)]">
          <MaterialIcon icon="person" className="text-[21px] text-primary" />
        </div>
        <p className="text-[12px] font-black uppercase tracking-[0.25em] text-on-surface-variant/55">User Question</p>
      </div>
      <p className="max-w-[20rem] text-[1.45rem] font-semibold leading-[2.55rem] tracking-[-0.02em] text-on-surface">
        {SHOWCASE_CHAT_QUESTION}
      </p>
    </div>
  );
}

function ShowcaseStage({
  variant = "workspace",
  replay,
}: {
  variant?: ShowcaseStageVariant;
  replay?: AnalysisReplayState;
}) {
  const autoScrollAnchorRef = useShowcaseAutoScroll(variant === "workspace" ? replay : undefined);

  if (variant === "thumbnail") {
    const completeReplay = createCompletedAnalysisReplayState();

    return (
      <div className="flex min-h-[100dvh] w-full flex-col gap-8">
        <div className="flex items-center justify-between gap-8 border-b border-outline-variant/28 pb-5">
          <WorkspaceBrandLockup compact />
          <div className="flex flex-wrap justify-end gap-4">
            {SHOWCASE_SCOPE_DOCUMENTS.map((document) => (
              <ShowcaseScopeChip key={document.filename} document={document} />
            ))}
          </div>
        </div>

        <div className="grid flex-1 items-start gap-7 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="pt-18">
            <ThumbnailQuestionCue />
          </div>

          <div className="relative flex min-h-[calc(100dvh-8rem)] items-start">
            <div className="absolute -left-10 top-12 z-10 hidden h-[4.9rem] w-[4.9rem] shrink-0 items-center justify-center rounded-full bg-primary shadow-[0_20px_40px_rgba(67,56,202,0.24)] ring-4 ring-primary-container/40 xl:flex">
              <MaterialIcon icon="auto_awesome" className="text-[1.55rem] text-white" filled />
            </div>

            <div className="w-full max-w-[92rem] rounded-[2.7rem] border border-outline-variant/40 bg-[linear-gradient(180deg,var(--workspace-preview-start),var(--workspace-preview-end))] px-12 py-11 shadow-[0_30px_70px_rgba(25,28,30,0.11)] xl:px-14 xl:py-14">
              <div className="mb-8">
                <p className="text-[2.75rem] font-black uppercase tracking-[-0.05em] text-on-surface xl:text-[3.5rem]">
                  {completeReplay.titleText}
                </p>
                <p className="mt-2 text-[15px] font-bold uppercase tracking-[0.22em] text-on-surface-variant/50">
                  {completeReplay.subtitleText}
                </p>
              </div>

              <div className="space-y-8">
                {SHOWCASE_COMPLIANCE_SECTIONS.slice(0, completeReplay.visibleSectionCount).map((section, index) => (
                  <ComplianceRiskSection
                    key={section.title}
                    section={section}
                    animate={false}
                    itemDelayBase={index * 80}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeReplay = replay ?? createCompletedAnalysisReplayState();

  return (
    <div className="w-full max-w-[1680px] px-3 lg:px-6">
      <div className="mb-10">
        <p className="mb-5 text-[14px] font-black uppercase tracking-[0.24em] text-on-surface-variant/55">
          Document Scope
        </p>
        <div className="flex flex-wrap gap-4">
          {SHOWCASE_SCOPE_DOCUMENTS.map((document) => (
            <ShowcaseScopeChip key={document.filename} document={document} />
          ))}
        </div>
      </div>

      <div className="mb-10 flex items-start gap-6">
        <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full border border-secondary/25 bg-secondary-container shadow-[0_12px_28px_rgba(25,28,30,0.05)]">
          <MaterialIcon icon="person" className="text-[28px] text-primary" />
        </div>
        <div className="pt-3">
          {activeReplay.showUserMessage ? (
            <p className="max-w-[1460px] text-[1.7rem] font-semibold leading-[3.25rem] tracking-[-0.025em] text-on-surface lg:text-[2rem]">
              {activeReplay.userText}
            </p>
          ) : (
            <p className="text-[15px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/45">
              Waiting for prompt submission...
            </p>
          )}
        </div>
      </div>

      {activeReplay.showThinking ? (
        <div className="mb-10 flex items-start gap-7">
          <div className="mt-2 flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center rounded-full bg-primary shadow-[0_18px_38px_rgba(67,56,202,0.24)] ring-4 ring-primary-container/40">
            <MaterialIcon icon="auto_awesome" className="text-[1.75rem] text-white" filled />
          </div>
          <div className="flex-1">
            <ShowcaseAssistantLoader label="Reviewing active PDFs before generation" />
          </div>
        </div>
      ) : null}

      {activeReplay.assistantVisible ? (
        <div className="flex items-start gap-7">
          <div className="mt-2 flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center rounded-full bg-primary shadow-[0_18px_38px_rgba(67,56,202,0.24)] ring-4 ring-primary-container/40">
            <MaterialIcon icon="auto_awesome" className="text-[1.75rem] text-white" filled />
          </div>
          <div className="flex-1 rounded-[2.8rem] border border-outline-variant/40 bg-[linear-gradient(180deg,var(--workspace-preview-start),var(--workspace-preview-end))] px-14 py-12 shadow-[0_28px_64px_rgba(25,28,30,0.11)] transition-all duration-500 translate-y-0 opacity-100 lg:px-16 lg:py-14">
            <div className="mb-8">
              <p className="text-[2.8rem] font-black uppercase tracking-[-0.05em] text-on-surface lg:text-[3.3rem]">
                {activeReplay.titleText}
              </p>
              <p className="mt-3 text-[16px] font-bold uppercase tracking-[0.22em] text-on-surface-variant/50">
                {activeReplay.subtitleText}
              </p>
            </div>

            <div className="space-y-8">
              {SHOWCASE_COMPLIANCE_SECTIONS.slice(0, activeReplay.visibleSectionCount).map((section, index) => (
                <ComplianceRiskSection
                  key={section.title}
                  section={section}
                  animate
                  itemDelayBase={index * 100}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div ref={autoScrollAnchorRef} className="h-10" aria-hidden="true" />
    </div>
  );
}

function WorkspaceComposer({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  placeholder = "Ask about the active PDFs...",
  disabled = false,
  readOnly = false,
  showCaret = false,
  caretActive = false,
  submitAriaLabel = "Send message",
  buttonPressed = false,
  variant = "default",
}: {
  value: string;
  onChange?: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  showCaret?: boolean;
  caretActive?: boolean;
  submitAriaLabel?: string;
  buttonPressed?: boolean;
  variant?: "default" | "showcase";
}) {
  const isShowcaseVariant = variant === "showcase";

  return (
    <form
      onSubmit={onSubmit}
      className={`mb-0 overflow-hidden border border-outline-variant/45 bg-surface-container-lowest shadow-[0_8px_24px_rgba(25,28,30,0.06)] ${
        isShowcaseVariant ? "rounded-[2.4rem] shadow-[0_20px_44px_rgba(25,28,30,0.09)]" : "rounded-3xl"
      }`}
    >
      <div className={`flex items-center gap-4 ${isShowcaseVariant ? "p-8 lg:p-9" : "p-5"}`}>
        <div className="flex-1">
          {showCaret && readOnly ? (
            <div
              aria-label={placeholder}
              className={`w-full whitespace-pre-wrap break-words px-1 text-on-surface ${
                isShowcaseVariant ? "min-h-20 py-5 text-[24px] leading-[2.75rem] lg:text-[28px]" : "min-h-12 py-3 text-[15px] leading-6"
              }`}
            >
              {value ? (
                <>
                  <span>{value}</span>
                  <TypingCaret active={caretActive} />
                </>
              ) : (
                <span className="text-on-surface-variant/40">
                  {placeholder}
                  <TypingCaret active={caretActive} />
                </span>
              )}
            </div>
          ) : (
            <textarea
              value={value}
              onChange={onChange ? (event) => onChange(event.target.value) : undefined}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              readOnly={readOnly}
              disabled={disabled}
              className={`w-full cursor-text resize-none border-none bg-surface-container-lowest px-1 text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-default ${
                isShowcaseVariant ? "min-h-20 py-5 text-[24px] leading-[2.75rem] lg:text-[28px]" : "min-h-12 py-3 text-[15px] leading-6"
              }`}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={disabled}
            className={`flex cursor-pointer flex-none items-center justify-center self-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-[0_14px_28px_rgba(67,56,202,0.34)] active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
              isShowcaseVariant ? "h-[4.5rem] w-[4.5rem]" : "h-11 w-11"
            } ${
              buttonPressed ? "scale-90" : ""
            }`}
            aria-label={submitAriaLabel}
          >
            <MaterialIcon icon="send" filled />
          </button>
        </div>
      </div>
    </form>
  );
}

function ThumbnailPreviewShell() {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface text-on-surface">
      <div className="flex min-h-[100dvh] w-full items-start px-10 py-10 xl:px-12 xl:py-12">
        <ShowcaseStage variant="thumbnail" />
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
      <div className="rounded-3xl border border-outline-variant/40 bg-[var(--workspace-elevated)] p-8 shadow-sm">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-on-surface">{document.filename}</h2>
        <p className="mt-2 text-sm text-on-surface-variant">
          PDF preview
          {" \u00b7 "}
          {formatFileSize(document.file_size)}
          {" \u00b7 "}
          {formatRelativeTime(document.upload_date)}
        </p>
      </div>
      <div className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-[var(--workspace-elevated)] shadow-sm">
        <iframe
          title={`Preview of ${document.filename}`}
          src={getDocumentFileUrl(document.id)}
          className="h-[calc(100vh-21rem)] min-h-[36rem] w-full bg-surface-container-low"
        />
      </div>
    </div>
  );
}

export default function ResourceWorkspace({
  mode = "default",
}: {
  mode?: ResourceWorkspaceMode;
}) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const initializedRef = useRef(false);
  const [theme, setTheme] = useState<WorkspaceTheme>("light");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [analysisPlaybackKey, setAnalysisPlaybackKey] = useState(0);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<ConversationSelection>(null);
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
  const [deletingConversationId, setDeletingConversationId] = useState<number | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null);
  const isThumbnailPreview = mode === "thumbnail-preview";
  const isShowcaseSelected = selectedConversationId === SHOWCASE_CHAT_ID;
  const isDarkMode = theme === "dark";
  const analysisReplay = useAnalysisReplay(isShowcaseSelected, analysisPlaybackKey);

  const selectedConversation = useMemo(
    () =>
      isRealConversationId(selectedConversationId)
        ? conversations.find((conversation) => conversation.id === selectedConversationId) ?? null
        : null,
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

  function syncConversationState(detail: ConversationDetail) {
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

  async function loadConversation(conversationId: number) {
    const detail = await fetchConversation(conversationId);
    syncConversationState(detail);
  }

  useEffect(() => {
    setTheme(getPreferredTheme());
    setIsSidebarCollapsed(getPreferredSidebarState());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = theme;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (isThumbnailPreview) {
      setIsBootstrapping(false);
      return;
    }

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
            syncConversationState(detail);
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
  }, [isThumbnailPreview]);

  if (isThumbnailPreview) {
    return <ThumbnailPreviewShell />;
  }

  async function handleSelectConversation(conversationId: ConversationSelection) {
    setErrorMessage(null);
    setStatusMessage(null);
    setStageMode("chat");
    setPreviewDocumentId(null);
    setIsPickerOpen(false);

    if (!isRealConversationId(conversationId)) {
      setAnalysisPlaybackKey((current) => current + 1);
      setSelectedConversationId(SHOWCASE_CHAT_ID);
      replaceConversationInUrl(null);
      return;
    }

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
      syncConversationState(detail);
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
      let conversationId = isRealConversationId(selectedConversationId) ? selectedConversationId : null;
      if (!conversationId) {
        const detail = await createConversation();
        conversationId = detail.conversation.id;
        syncConversationState(detail);
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
    if (!isRealConversationId(selectedConversationId)) {
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

  async function handleDeleteConversation(conversation: ConversationSummary) {
    if (
      !confirmDestructiveAction(`Delete "${conversation.title}" permanently? This removes it from the sidebar and backend.`)
    ) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setStageMode("chat");
    setPreviewDocumentId(null);
    setIsPickerOpen(false);
    setDeletingConversationId(conversation.id);

    try {
      await deleteConversation(conversation.id);

      const remainingConversations = conversations.filter(
        (currentConversation) => currentConversation.id !== conversation.id,
      );
      setConversations(remainingConversations);

      if (selectedConversationId === conversation.id) {
        setSelectedConversationId(null);
        setMessages([]);
        setActiveDocuments([]);
        replaceConversationInUrl(null);

        if (remainingConversations.length) {
          await loadConversation(remainingConversations[0].id);
        } else {
          const detail = await createConversation();
          syncConversationState(detail);
        }
      }

      setStatusMessage(`Deleted "${conversation.title}".`);
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setDeletingConversationId(null);
    }
  }

  async function handleDeleteDocument(document: DocumentSummary) {
    if (
      !confirmDestructiveAction(
        `Delete "${document.filename}" permanently? This removes it from the library, active context, and backend storage.`,
      )
    ) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsPickerOpen(false);
    setDeletingDocumentId(document.id);

    try {
      await deleteDocument(document.id);

      setDocuments((current) => current.filter((entry) => entry.id !== document.id));

      if (previewDocumentId === document.id) {
        setPreviewDocumentId(null);
        setStageMode("chat");
      }

      const refreshedConversations = sortConversations(await fetchConversations());
      setConversations(refreshedConversations);

      if (isRealConversationId(selectedConversationId)) {
        const detail = await fetchConversation(selectedConversationId);
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
      } else {
        setActiveDocuments((current) => current.filter((entry) => entry.id !== document.id));
      }

      setStatusMessage(`${document.filename} deleted.`);
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function submitCurrentDraft() {
    const question = draft.trim();
    if (!question) {
      return;
    }

    if (isShowcaseSelected) {
      return;
    }

    if (!isRealConversationId(selectedConversationId)) {
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

  const stageTitle = isShowcaseSelected ? SHOWCASE_CHAT_TITLE : formatStageTitle(selectedConversation);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface text-on-surface" data-theme={theme}>
      <input
        ref={uploadInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={handleUploadSelection}
        aria-label="Choose PDF file"
      />
      {isSidebarCollapsed ? (
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed(false)}
          className="fixed left-4 top-4 z-30 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-outline-variant/40 bg-[var(--workspace-elevated)] text-on-surface-variant shadow-[0_10px_24px_rgba(25,28,30,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:text-primary hover:shadow-[0_16px_28px_rgba(25,28,30,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <MaterialIcon icon="chevron_right" className="text-[18px]" />
        </button>
      ) : null}
      <aside
        className={`fixed left-0 top-0 z-20 flex h-[100dvh] w-80 flex-col bg-surface-container px-6 py-8 font-['Inter'] antialiased tracking-tight transition-transform duration-300 ${
          isSidebarCollapsed ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex-1">
            <WorkspaceBrandLockup />
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-outline-variant/40 bg-[var(--workspace-elevated)] text-on-surface-variant shadow-[0_10px_24px_rgba(25,28,30,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:text-primary hover:shadow-[0_16px_28px_rgba(25,28,30,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <MaterialIcon icon="chevron_left" className="text-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-outline-variant/40 bg-[var(--workspace-elevated)] text-on-surface-variant shadow-[0_10px_24px_rgba(25,28,30,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:text-primary hover:shadow-[0_16px_28px_rgba(25,28,30,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            <MaterialIcon icon={isDarkMode ? "light_mode" : "dark_mode"} className="text-[18px]" />
          </button>
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
            onDelete={handleDeleteConversation}
            deletingConversationId={deletingConversationId}
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
            onDelete={handleDeleteDocument}
            deletingDocumentId={deletingDocumentId}
          />
        </div>
      </aside>
      <main
        className={`relative flex min-h-[100dvh] flex-col bg-surface transition-[margin] duration-300 ${
          isSidebarCollapsed ? "ml-0" : "ml-80"
        }`}
      >
        {isShowcaseSelected ? null : (
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
        )}
        <section
          className={`mx-auto w-full px-12 ${
            isShowcaseSelected ? "max-w-none py-5 overflow-visible" : "max-w-5xl flex-1 py-10"
          }`}
        >
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
          {isShowcaseSelected ? (
            <ShowcaseStage replay={analysisReplay} />
          ) : stageMode === "preview" && previewDocument ? (
            <PreviewStage document={previewDocument} />
          ) : (
            <ChatStage title={stageTitle} messages={messages} loading={isBootstrapping} />
          )}
        </section>
        {stageMode === "chat" && (!isShowcaseSelected || (!analysisReplay.isSubmitting && !analysisReplay.hasSubmitted)) ? (
          <footer className={`mt-auto bg-surface px-12 ${isShowcaseSelected ? "pb-6 pt-2" : "pb-10 pt-0"}`}>
            <div className={`${isShowcaseSelected ? "w-full max-w-[1680px]" : "mx-auto max-w-4xl"}`}>
              {isShowcaseSelected ? (
                <WorkspaceComposer
                  value={analysisReplay.composerText}
                  onSubmit={(event) => {
                    event.preventDefault();
                  }}
                  placeholder="Ask about the active PDFs..."
                  readOnly
                  showCaret
                  caretActive={analysisReplay.showComposerCaret}
                  submitAriaLabel="Send message"
                  buttonPressed={analysisReplay.isSubmitting}
                  variant="showcase"
                />
              ) : (
                <WorkspaceComposer
                  value={draft}
                  onChange={setDraft}
                  onKeyDown={handleComposerKeyDown}
                  onSubmit={handleSendMessage}
                  placeholder="Ask about the active PDFs..."
                  disabled={isSending || isBootstrapping}
                  submitAriaLabel="Send message"
                />
              )}
            </div>
          </footer>
        ) : null}
      </main>
    </div>
  );
}

