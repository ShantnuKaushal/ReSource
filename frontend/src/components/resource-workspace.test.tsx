import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResourceWorkspace from "@/components/resource-workspace";

function jsonResponse(data: unknown, options?: { ok?: boolean; status?: number }) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: async () => data,
  } as Response;
}

const documents = [
  {
    id: 1,
    filename: "project_alpha_tech_spec.pdf",
    upload_date: "2026-04-12T00:00:00Z",
    chunk_count: 6,
    file_size: 1258291,
    file_url: "/documents/1/file",
  },
  {
    id: 2,
    filename: "technical_faq_guide.pdf",
    upload_date: "2026-04-11T00:00:00Z",
    chunk_count: 4,
    file_size: 460800,
    file_url: "/documents/2/file",
  },
];

const conversations = [
  {
    id: 7,
    title: "Create Chatbot GPT...",
    created_at: "2026-04-12T00:00:00Z",
    updated_at: "2026-04-12T02:00:00Z",
    message_count: 2,
    active_document_count: 1,
    latest_message_preview: "Create a chatbot gpt using python language what will be step for that",
  },
  {
    id: 8,
    title: "Auth Review",
    created_at: "2026-04-11T00:00:00Z",
    updated_at: "2026-04-11T02:00:00Z",
    message_count: 2,
    active_document_count: 1,
    latest_message_preview: "What about the user authentication method in project_alpha_tech_spec.pdf?",
  },
];

const showcaseQuestion =
  "What are the critical risks and compliance implications highlighted within these documents?";

function makeConversationDetail(conversationId: number) {
  if (conversationId === 8) {
    return {
      conversation: conversations[1],
      messages: [
        {
          id: 20,
          sender: "user" as const,
          text: "What about the user authentication method in project_alpha_tech_spec.pdf?",
          citations: [],
          created_at: "2026-04-11T02:00:00Z",
        },
        {
          id: 21,
          sender: "assistant" as const,
          text: "OAuth 2.0 and OpenID Connect are used for authentication.",
          citations: ["project_alpha_tech_spec.pdf"],
          created_at: "2026-04-11T02:00:05Z",
        },
      ],
      active_documents: [documents[0]],
    };
  }

  return {
    conversation: conversations[0],
    messages: [
      {
        id: 10,
        sender: "user" as const,
        text: "Create a chatbot gpt using python language what will be step for that",
        citations: [],
        created_at: "2026-04-12T02:00:00Z",
      },
      {
        id: 11,
        sender: "assistant" as const,
        text: "Use the OpenAI SDK, environment variables, and a prompt handler.",
        citations: ["project_alpha_tech_spec.pdf"],
        created_at: "2026-04-12T02:00:05Z",
      },
    ],
    active_documents: [documents[0]],
  };
}

function makeMarkdownConversationDetail() {
  return {
    conversation: conversations[0],
    messages: [
      {
        id: 30,
        sender: "user" as const,
        text: "What stack should I use?",
        citations: [],
        created_at: "2026-04-12T04:00:00Z",
      },
      {
        id: 31,
        sender: "assistant" as const,
        text: "## Recommended stack\n\nUse **Python** for the backend.\n\n- FastAPI for the API layer\n- PostgreSQL for storage\n- Docker for deployment",
        citations: ["project_alpha_tech_spec.pdf"],
        created_at: "2026-04-12T04:00:05Z",
      },
    ],
    active_documents: [documents[0]],
  };
}

class UploadSuccessXHR {
  static nextPayload = {
    message: "File processed successfully",
    doc_id: 9,
    document: {
      id: 9,
      filename: "new_upload.pdf",
      upload_date: "2026-04-12T03:00:00Z",
      chunk_count: 5,
      file_size: 512000,
      file_url: "/documents/9/file",
    },
  };

  status = 200;
  responseText = JSON.stringify(UploadSuccessXHR.nextPayload);
  upload = { addEventListener() {} };
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;

  open() {}

  send() {
    this.onload?.();
  }
}

describe("ResourceWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.removeItem("resource-workspace-theme");
    window.localStorage.removeItem("resource-workspace-sidebar-collapsed");
    delete document.documentElement.dataset.theme;
    window.history.replaceState({}, "", "/");
  });

  it("renders the Stitch-style shell and removes search and prompt pills", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7")) {
          return jsonResponse(makeConversationDetail(7));
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("ReSource")).toBeInTheDocument();
    expect(screen.getByText("Digital Atelier")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload PDF" })).toBeInTheDocument();
    expect(screen.getByText("Active Context")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
    expect(screen.queryByText("Summarize documents")).not.toBeInTheDocument();
    expect(screen.getByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();
  });

  it("opens a PDF preview in the main stage when a library item is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7")) {
          return jsonResponse(makeConversationDetail(7));
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "technical_faq_guide.pdf" }));

    expect(await screen.findByTitle("Preview of technical_faq_guide.pdf")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Ask about the active PDFs...")).not.toBeInTheDocument();
  });

  it("adds an inactive PDF into active context from the plus picker", async () => {
    let detail = makeConversationDetail(7);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations") && (!init?.method || init.method === "GET")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7")) {
          return jsonResponse(detail);
        }

        if (url.endsWith("/conversations/7/active-documents") && init?.method === "PUT") {
          detail = {
            ...detail,
            active_documents: [documents[0], documents[1]],
          };
          return jsonResponse(detail.active_documents);
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getAllByRole("button", { name: "technical_faq_guide.pdf" }).at(-1)!);

    await waitFor(() => {
      expect(screen.getAllByText("[PDF] technical_faq_guide.pdf").length).toBeGreaterThan(0);
    });
  });

  it("rejects non-PDF uploads and keeps the Stitch layout intact", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7")) {
          return jsonResponse(makeConversationDetail(7));
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose PDF file"), {
      target: {
        files: [new File(["test"], "notes.txt", { type: "text/plain" })],
      },
    });

    expect(screen.getByText("Only PDF uploads are supported.")).toBeInTheDocument();
  });

  it("uploads a PDF, adds it to active context, and switches to preview mode", async () => {
    let detail = makeConversationDetail(7);
    vi.stubGlobal("XMLHttpRequest", UploadSuccessXHR as unknown as typeof XMLHttpRequest);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations") && (!init?.method || init.method === "GET")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7/active-documents") && init?.method === "PUT") {
          detail = {
            ...detail,
            active_documents: [documents[0], UploadSuccessXHR.nextPayload.document],
          };
          return jsonResponse(detail.active_documents);
        }

        if (url.endsWith("/conversations/7")) {
          return jsonResponse(detail);
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose PDF file"), {
      target: {
        files: [new File(["pdf"], "new_upload.pdf", { type: "application/pdf" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("new_upload.pdf uploaded.")).toBeInTheDocument();
      expect(screen.getByTitle("Preview of new_upload.pdf")).toBeInTheDocument();
    });
  });

  it("loads the selected conversation from the query string", async () => {
    window.history.replaceState({}, "", "/?conversationId=8");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/8")) {
          return jsonResponse(makeConversationDetail(8));
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("OAuth 2.0 and OpenID Connect are used for authentication.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auth Review" })).toHaveAttribute("aria-pressed", "true");
  });

  it("surfaces a chat error inline when the message request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations") && (!init?.method || init.method === "GET")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7") && (!init?.method || init.method === "GET")) {
          return jsonResponse(makeConversationDetail(7));
        }

        if (url.endsWith("/conversations/7/messages") && init?.method === "POST") {
          return jsonResponse({ error: "AI error. Please try again." }, { ok: false, status: 500 });
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Ask about the active PDFs..."), {
      target: { value: "What does the policy cover?" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Ask about the active PDFs..."), {
      key: "Enter",
      code: "Enter",
    });

    await waitFor(() => {
      expect(screen.getAllByText("AI error. Please try again.").length).toBeGreaterThan(0);
    });
  });

  it("renders structured assistant markdown as headings and bullets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7")) {
          return jsonResponse(makeMarkdownConversationDetail());
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByRole("heading", { name: "Recommended stack" })).toBeInTheDocument();
    expect(screen.getByText("FastAPI for the API layer")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL for storage")).toBeInTheDocument();
  });

  it("toggles dark mode and keeps the analysis entry accessible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7")) {
          return jsonResponse(makeConversationDetail(7));
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    fireEvent.click(screen.getByRole("button", { name: "Analysis" }));

    expect(await screen.findByText(showcaseQuestion, undefined, { timeout: 12000 })).toBeInTheDocument();
  }, 15000);

  it("renders the isolated thumbnail preview without the full app sidebar", () => {
    render(<ResourceWorkspace mode="thumbnail-preview" />);

    expect(screen.getByText(showcaseQuestion)).toBeInTheDocument();
    expect(screen.getByText("Executive Compliance Summary")).toBeInTheDocument();
    expect(screen.queryByText("Analysis")).not.toBeInTheDocument();
    expect(screen.queryByText("2 Active PDFs")).not.toBeInTheDocument();
    expect(screen.queryByText("Live Review")).not.toBeInTheDocument();
    expect(screen.queryByText("3 Findings")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload PDF" })).not.toBeInTheDocument();
    expect(screen.queryByText("Document Library")).not.toBeInTheDocument();
  });

  it("renders the analysis screen and returns to a real conversation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7")) {
          return jsonResponse(makeConversationDetail(7));
        }

        if (url.endsWith("/conversations/8")) {
          return jsonResponse(makeConversationDetail(8));
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Analysis" }));

    expect(await screen.findByText(showcaseQuestion, undefined, { timeout: 12000 })).toBeInTheDocument();
    expect(await screen.findByText("Executive Compliance Summary", undefined, { timeout: 12000 })).toBeInTheDocument();
    expect(await screen.findByText(/I\. DATA SOVEREIGNTY VIOLATION/, undefined, { timeout: 14000 })).toBeInTheDocument();
    expect(await screen.findByText(/II\. AUTHENTICATION REDUNDANCY/, undefined, { timeout: 14000 })).toBeInTheDocument();
    expect(await screen.findByText(/III\. POLICY ALIGNMENT/, undefined, { timeout: 14000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Send analysis replay" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Auth Review" }));

    expect(await screen.findByText("OAuth 2.0 and OpenID Connect are used for authentication.")).toBeInTheDocument();
  }, 40000);

  it("collapses and re-expands the sidebar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/documents")) {
          return jsonResponse(documents);
        }

        if (url.endsWith("/conversations")) {
          return jsonResponse(conversations);
        }

        if (url.endsWith("/conversations/7")) {
          return jsonResponse(makeConversationDetail(7));
        }

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("deletes a conversation from the sidebar and backend while keeping Analysis protected", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/documents")) {
        return jsonResponse(documents);
      }

      if (url.endsWith("/conversations") && (!init?.method || init.method === "GET")) {
        return jsonResponse(conversations);
      }

      if (url.endsWith("/conversations/7") && (!init?.method || init.method === "GET")) {
        return jsonResponse(makeConversationDetail(7));
      }

      if (url.endsWith("/conversations/7") && init?.method === "DELETE") {
        return jsonResponse({ message: "Deleted" });
      }

      if (url.endsWith("/conversations/8") && (!init?.method || init.method === "GET")) {
        return jsonResponse(makeConversationDetail(8));
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete chat Analysis" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete chat Create Chatbot GPT..." }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:5000/conversations/7",
        expect.objectContaining({ method: "DELETE", cache: "no-store" }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Create Chatbot GPT..." })).not.toBeInTheDocument();
    });

    expect(await screen.findByText("OAuth 2.0 and OpenID Connect are used for authentication.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analysis" })).toBeInTheDocument();
  });

  it("deletes a document from the library and removes it from active context", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));

    let detail = makeConversationDetail(7);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/documents/1") && init?.method === "DELETE") {
        detail = {
          ...detail,
          active_documents: [],
        };
        return jsonResponse({ message: "Deleted" });
      }

      if (url.endsWith("/documents")) {
        return jsonResponse(documents);
      }

      if (url.endsWith("/conversations") && (!init?.method || init.method === "GET")) {
        return jsonResponse(
          conversations.map((conversation) =>
            conversation.id === 7 ? { ...conversation, active_document_count: 0 } : conversation,
          ),
        );
      }

      if (url.endsWith("/conversations/7")) {
        return jsonResponse(detail);
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ResourceWorkspace />);

    expect(await screen.findByText("Use the OpenAI SDK, environment variables, and a prompt handler.")).toBeInTheDocument();
    expect(screen.getByText("[PDF] project_alpha_tech_spec.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete document project_alpha_tech_spec.pdf" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:5000/documents/1",
        expect.objectContaining({ method: "DELETE", cache: "no-store" }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "project_alpha_tech_spec.pdf" })).not.toBeInTheDocument();
    });

    expect(screen.queryByText("[PDF] project_alpha_tech_spec.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("project_alpha_tech_spec.pdf deleted.")).toBeInTheDocument();
  });
});
