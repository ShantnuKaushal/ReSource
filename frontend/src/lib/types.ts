export type ResourceDocument = {
  id: number;
  filename: string;
  upload_date: string;
  chunk_count: number;
};

export type UploadResponse = {
  message: string;
  doc_id: number;
};

export type ChatResponse = {
  answer: string;
  citations?: string[];
};

export type Message = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  citations: string[];
  pending?: boolean;
};
