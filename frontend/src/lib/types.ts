export type DocumentSummary = {
  id: number;
  filename: string;
  upload_date: string;
  chunk_count: number;
  file_size: number;
  file_url: string;
};

export type ConversationSummary = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  active_document_count: number;
  latest_message_preview: string;
};

export type ChatMessage = {
  id: number;
  sender: "user" | "assistant";
  text: string;
  citations: string[];
  created_at: string;
};

export type ConversationDetail = {
  conversation: ConversationSummary;
  messages: ChatMessage[];
  active_documents: DocumentSummary[];
};

export type UploadResponse = {
  message: string;
  doc_id: number;
  document: DocumentSummary;
};

export type SendMessageResponse = {
  conversation: ConversationSummary;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
};

export type PendingMessage = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  citations: string[];
  pending?: boolean;
};
