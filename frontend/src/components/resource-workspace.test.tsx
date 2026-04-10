import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResourceWorkspace from "@/components/resource-workspace";

function jsonResponse(data: unknown, options?: { ok?: boolean; status?: number }) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: async () => data,
  } as Response;
}

class UploadFailureXHR {
  static instances: UploadFailureXHR[] = [];
  status = 500;
  responseText = JSON.stringify({ error: "Upload failed. Please try again." });
  upload = {
    addEventListener: (
      _event: string,
      handler: (event: { lengthComputable: boolean; loaded: number; total: number }) => void,
    ) => {
      this.progressHandler = handler;
    },
  };
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  private progressHandler:
    | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
    | null = null;

  constructor() {
    UploadFailureXHR.instances.push(this);
  }

  open() {}

  send() {
    this.progressHandler?.({ lengthComputable: true, loaded: 50, total: 100 });
    this.onload?.();
  }
}

describe("ResourceWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    UploadFailureXHR.instances = [];
  });

  it("shows the empty library state and validates missing uploads", async () => {
    render(<ResourceWorkspace />);

    expect(await screen.findByText("Library is empty")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Index document" }));

    expect(screen.getByText("Choose a PDF before processing.")).toBeInTheDocument();
  });

  it("renders an inline upload error when the backend upload fails", async () => {
    vi.stubGlobal("XMLHttpRequest", UploadFailureXHR as unknown as typeof XMLHttpRequest);
    render(<ResourceWorkspace />);

    await screen.findByText("Library is empty");

    const input = screen.getByLabelText("Choose PDF file");
    const file = new File(["test"], "notes.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Index document" }));

    await waitFor(() => {
      expect(screen.getByText("Upload failed. Please try again.")).toBeInTheDocument();
    });
  });

  it("surfaces a chat error when the question request fails", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 1,
            filename: "policy.pdf",
            upload_date: "2026-04-10T00:00:00Z",
            chunk_count: 6,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: "AI error. Please try again." }, { ok: false, status: 500 }),
      );

    vi.stubGlobal("fetch", fetchMock);
    render(<ResourceWorkspace />);

    expect(await screen.findByText("policy.pdf")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ask a question"), {
      target: { value: "What does the policy cover?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask ReSource" }));

    await waitFor(() => {
      expect(screen.getByText("AI error. Please try again.")).toBeInTheDocument();
    });
  });
});
