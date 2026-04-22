import type {
  ConversationDetail,
  ConversationSummary,
  DocumentSummary,
  SendMessageResponse,
  UploadResponse,
} from "@/lib/types";

const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000").replace(/\/$/, "");

async function parseError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${input}`, {
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

async function requestVoid(input: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${input}`, {
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}

export function getDocumentFileUrl(documentId: number) {
  return `${baseUrl}/documents/${documentId}/file`;
}

export function fetchDocuments() {
  return requestJson<DocumentSummary[]>("/documents");
}

export function fetchConversations() {
  return requestJson<ConversationSummary[]>("/conversations");
}

export function createConversation() {
  return requestJson<ConversationDetail>("/conversations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function fetchConversation(conversationId: number) {
  return requestJson<ConversationDetail>(`/conversations/${conversationId}`);
}

export function deleteConversation(conversationId: number) {
  return requestVoid(`/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export function updateConversationDocuments(conversationId: number, documentIds: number[]) {
  return requestJson<DocumentSummary[]>(`/conversations/${conversationId}/active-documents`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ document_ids: documentIds }),
  });
}

export function sendMessage(conversationId: number, question: string) {
  return requestJson<SendMessageResponse>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });
}

export function deleteDocument(documentId: number) {
  return requestVoid(`/documents/${documentId}`, {
    method: "DELETE",
  });
}

export function uploadDocument(file: File, onProgress?: (progress: number) => void) {
  return new Promise<UploadResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);
    request.open("POST", `${baseUrl}/upload`);

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }

      onProgress?.(Math.round((event.loaded / event.total) * 100));
    });

    request.onerror = () => {
      reject(new Error("Connection failed. Please try again."));
    };

    request.onload = () => {
      try {
        const payload = JSON.parse(request.responseText || "{}") as UploadResponse & {
          error?: string;
        };

        if (request.status >= 200 && request.status < 300) {
          resolve(payload);
          return;
        }

        reject(new Error(payload.error ?? "Upload failed. Please try again."));
      } catch {
        reject(new Error("Upload failed. Please try again."));
      }
    };

    request.send(formData);
  });
}
