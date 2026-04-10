import type { ChatResponse, ResourceDocument, UploadResponse } from "@/lib/types";

const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000").replace(/\/$/, "");

async function parseError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export async function fetchDocuments() {
  const response = await fetch(`${baseUrl}/documents`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as ResourceDocument[];
}

export async function sendQuestion(question: string) {
  const response = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as ChatResponse;
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
