import json
import os
import uuid
from datetime import datetime, timezone

import google.generativeai as genai
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from sqlalchemy import text
from werkzeug.utils import secure_filename

from database import Base, SessionLocal, engine
from models import ChatMessage, Conversation, ConversationDocument, Document, Embedding
from text_utils import (
    build_grounded_answer_prompt,
    chunk_text,
    normalize_grounded_answer,
)
from utils import extract_text_from_pdf, get_embedding

load_dotenv()

UPLOAD_FOLDER = "uploads"

app = Flask(__name__)
CORS(app)

genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
gemini_model = genai.GenerativeModel("gemini-flash-latest")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def utc_timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def make_storage_name(filename: str):
    sanitized = secure_filename(filename) or "document.pdf"
    base, extension = os.path.splitext(sanitized)
    safe_extension = extension or ".pdf"
    return f"{base}-{uuid.uuid4().hex}{safe_extension}"


def serialize_citations(citations):
    return json.dumps(citations or [])


def deserialize_citations(raw_value):
    if not raw_value:
        return []

    try:
        data = json.loads(raw_value)
    except json.JSONDecodeError:
        return []

    return data if isinstance(data, list) else []


def conversation_title_from_text(text_value: str):
    trimmed = " ".join((text_value or "").split()).strip()
    if not trimmed:
        return "New chat"

    return trimmed[:60].rstrip(" .,!?") or "New chat"


def document_payload(document: Document):
    file_size = 0
    if document.file_path and os.path.exists(document.file_path):
        file_size = os.path.getsize(document.file_path)

    return {
        "id": document.id,
        "filename": document.filename,
        "upload_date": document.upload_date,
        "chunk_count": len(document.embeddings),
        "file_size": file_size,
        "file_url": f"/documents/{document.id}/file",
    }


def message_payload(message: ChatMessage):
    return {
        "id": message.id,
        "sender": message.sender,
        "text": message.text,
        "citations": deserialize_citations(message.citations),
        "created_at": message.created_at,
    }


def conversation_summary_payload(conversation: Conversation):
    latest_message = conversation.messages[-1].text if conversation.messages else ""

    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "message_count": len(conversation.messages),
        "active_document_count": len(conversation.active_documents),
        "latest_message_preview": latest_message[:96],
    }


def conversation_detail_payload(conversation: Conversation):
    active_documents = [link.document for link in conversation.active_documents]

    return {
        "conversation": conversation_summary_payload(conversation),
        "messages": [message_payload(message) for message in conversation.messages],
        "active_documents": [document_payload(document) for document in active_documents],
    }


def delete_file_if_present(file_path: str | None):
    if not file_path or not os.path.exists(file_path):
        return

    os.remove(file_path)


def seed_legacy_document_fields():
    with SessionLocal() as db:
        documents = (
            db.query(Document)
            .filter((Document.stored_filename.is_(None)) | (Document.file_path.is_(None)))
            .all()
        )

        for document in documents:
            stored_filename = document.stored_filename or secure_filename(document.filename) or f"{document.id}.pdf"
            document.stored_filename = stored_filename
            document.file_path = document.file_path or os.path.join(UPLOAD_FOLDER, stored_filename)

        if documents:
            db.commit()


with engine.connect() as connection:
    connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    connection.commit()

Base.metadata.create_all(bind=engine)

with engine.connect() as connection:
    connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS stored_filename VARCHAR"))
    connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path VARCHAR"))
    connection.commit()

seed_legacy_document_fields()


@app.route("/documents", methods=["GET"])
def list_documents():
    with SessionLocal() as db:
        documents = db.query(Document).order_by(Document.id.desc()).all()
        return jsonify([document_payload(document) for document in documents]), 200


@app.route("/documents/<int:document_id>/file", methods=["GET"])
def get_document_file(document_id: int):
    with SessionLocal() as db:
        document = db.query(Document).filter(Document.id == document_id).first()

        if not document or not document.file_path:
            return jsonify({"error": "Document not found."}), 404

        if not os.path.exists(document.file_path):
            return jsonify({"error": "PDF file is missing from storage."}), 404

        return send_file(document.file_path, mimetype="application/pdf", download_name=document.filename)


@app.route("/documents/<int:document_id>", methods=["DELETE"])
def delete_document(document_id: int):
    with SessionLocal() as db:
        document = db.query(Document).filter(Document.id == document_id).first()

        if not document:
            return jsonify({"error": "Document not found."}), 404

        impacted_conversations = [link.conversation for link in document.conversation_links]
        timestamp = utc_timestamp()
        file_path = document.file_path
        filename = document.filename

        for conversation in impacted_conversations:
            conversation.updated_at = timestamp

        db.delete(document)
        db.commit()

    delete_file_if_present(file_path)

    return jsonify({"message": f'{filename} deleted successfully.'}), 200


@app.route("/upload", methods=["POST"])
def upload_document():
    if "file" not in request.files:
        return jsonify({"error": "No file part."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file."}), 400

    filename = secure_filename(file.filename)
    if not filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported right now."}), 400

    stored_filename = make_storage_name(filename)
    file_path = os.path.join(UPLOAD_FOLDER, stored_filename)
    file.save(file_path)

    raw_text = extract_text_from_pdf(file_path)
    if not raw_text.strip():
        os.remove(file_path)
        return jsonify({"error": "We couldn't extract text from that PDF."}), 400

    text_chunks = chunk_text(raw_text)
    if not text_chunks:
        os.remove(file_path)
        return jsonify({"error": "The PDF did not produce any retrievable chunks."}), 400

    with SessionLocal() as db:
        new_doc = Document(
            filename=filename,
            stored_filename=stored_filename,
            file_path=file_path,
            upload_date=utc_timestamp(),
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)

        for chunk in text_chunks:
            vector = get_embedding(chunk)
            db.add(Embedding(document_id=new_doc.id, text_chunk=chunk, vector=vector))

        db.commit()
        db.refresh(new_doc)

        return (
            jsonify(
                {
                    "message": "File processed successfully",
                    "doc_id": new_doc.id,
                    "document": document_payload(new_doc),
                }
            ),
            200,
        )


@app.route("/conversations", methods=["GET"])
def list_conversations():
    with SessionLocal() as db:
        conversations = db.query(Conversation).order_by(Conversation.updated_at.desc(), Conversation.id.desc()).all()
        return jsonify([conversation_summary_payload(conversation) for conversation in conversations]), 200


@app.route("/conversations", methods=["POST"])
def create_conversation():
    now = utc_timestamp()

    with SessionLocal() as db:
        conversation = Conversation(title="New chat", created_at=now, updated_at=now)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        return jsonify(conversation_detail_payload(conversation)), 201


@app.route("/conversations/<int:conversation_id>", methods=["GET"])
def get_conversation(conversation_id: int):
    with SessionLocal() as db:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()

        if not conversation:
            return jsonify({"error": "Conversation not found."}), 404

        return jsonify(conversation_detail_payload(conversation)), 200


@app.route("/conversations/<int:conversation_id>", methods=["DELETE"])
def delete_conversation(conversation_id: int):
    with SessionLocal() as db:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()

        if not conversation:
            return jsonify({"error": "Conversation not found."}), 404

        title = conversation.title
        db.delete(conversation)
        db.commit()

        return jsonify({"message": f'{title} deleted successfully.'}), 200


@app.route("/conversations/<int:conversation_id>/messages", methods=["GET"])
def get_conversation_messages(conversation_id: int):
    with SessionLocal() as db:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()

        if not conversation:
            return jsonify({"error": "Conversation not found."}), 404

        return jsonify([message_payload(message) for message in conversation.messages]), 200


@app.route("/conversations/<int:conversation_id>/active-documents", methods=["GET"])
def get_active_documents(conversation_id: int):
    with SessionLocal() as db:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()

        if not conversation:
            return jsonify({"error": "Conversation not found."}), 404

        documents = [link.document for link in conversation.active_documents]
        return jsonify([document_payload(document) for document in documents]), 200


@app.route("/conversations/<int:conversation_id>/active-documents", methods=["PUT"])
def update_active_documents(conversation_id: int):
    data = request.get_json(silent=True) or {}
    document_ids = data.get("document_ids")

    if not isinstance(document_ids, list):
        return jsonify({"error": "document_ids must be an array."}), 400

    normalized_ids = []
    for document_id in document_ids:
        if not isinstance(document_id, int):
            return jsonify({"error": "Every document id must be an integer."}), 400
        normalized_ids.append(document_id)

    with SessionLocal() as db:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            return jsonify({"error": "Conversation not found."}), 404

        documents = db.query(Document).filter(Document.id.in_(normalized_ids)).all() if normalized_ids else []
        found_ids = {document.id for document in documents}

        if found_ids != set(normalized_ids):
            return jsonify({"error": "One or more documents were not found."}), 404

        existing_by_document = {link.document_id: link for link in conversation.active_documents}
        next_links = []

        for document_id in normalized_ids:
            existing_link = existing_by_document.pop(document_id, None)
            if existing_link:
                next_links.append(existing_link)
            else:
                next_links.append(
                    ConversationDocument(
                        conversation_id=conversation.id,
                        document_id=document_id,
                        created_at=utc_timestamp(),
                    )
                )

        for stale_link in existing_by_document.values():
            db.delete(stale_link)

        conversation.active_documents = next_links
        conversation.updated_at = utc_timestamp()
        db.commit()
        db.refresh(conversation)

        return jsonify([document_payload(link.document) for link in conversation.active_documents]), 200


@app.route("/conversations/<int:conversation_id>/messages", methods=["POST"])
def create_message(conversation_id: int):
    data = request.get_json(silent=True) or {}
    user_question = (data.get("question") or "").strip()

    if not user_question:
        return jsonify({"error": "No question provided."}), 400

    with SessionLocal() as db:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            return jsonify({"error": "Conversation not found."}), 404

        active_document_ids = [link.document_id for link in conversation.active_documents]
        if not active_document_ids:
            return jsonify({"error": "Add at least one PDF to the active context before asking a question."}), 400

        try:
            query_vector = get_embedding(user_question)
            results = (
                db.query(Embedding)
                .filter(Embedding.document_id.in_(active_document_ids))
                .order_by(Embedding.vector.cosine_distance(query_vector))
                .limit(5)
                .all()
            )

            if not results:
                return jsonify({"error": "No indexed chunks are available for the active PDF context."}), 400

            context_text = "\n\n".join(result.text_chunk for result in results)
            prompt = build_grounded_answer_prompt(context_text, user_question)
            response = gemini_model.generate_content(prompt)
            answer_text = normalize_grounded_answer(response.text)
        except Exception as error:
            print(f"CHAT ERROR: {error}")
            return jsonify({"error": "AI error. Please try again."}), 500

        timestamp = utc_timestamp()
        if conversation.title == "New chat" and not conversation.messages:
            conversation.title = conversation_title_from_text(user_question)

        user_message = ChatMessage(
            conversation_id=conversation.id,
            sender="user",
            text=user_question,
            citations="[]",
            created_at=timestamp,
        )
        assistant_message = ChatMessage(
            conversation_id=conversation.id,
            sender="assistant",
            text=answer_text,
            citations=serialize_citations(sorted({result.document.filename for result in results})),
            created_at=timestamp,
        )

        conversation.updated_at = timestamp
        db.add(user_message)
        db.add(assistant_message)
        db.commit()
        db.refresh(conversation)

        return (
            jsonify(
                {
                    "conversation": conversation_summary_payload(conversation),
                    "user_message": message_payload(user_message),
                    "assistant_message": message_payload(assistant_message),
                }
            ),
            201,
        )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
