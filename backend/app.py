import os
from datetime import datetime, timezone
import google.generativeai as genai
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import text

from database import engine, get_db, Base
from models import Document, Embedding
from utils import extract_text_from_pdf, chunk_text, get_embedding

load_dotenv()

with engine.connect() as connection:
    connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    connection.commit()

Base.metadata.create_all(bind=engine)

app = Flask(__name__)
CORS(app)

genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
gemini_model = genai.GenerativeModel('gemini-flash-latest')

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def utc_timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

@app.route('/documents', methods=['GET'])
def list_documents():
    db = next(get_db())
    documents = db.query(Document).order_by(Document.id.desc()).all()
    payload = [
        {
            "id": document.id,
            "filename": document.filename,
            "upload_date": document.upload_date,
            "chunk_count": len(document.embeddings),
        }
        for document in documents
    ]
    return jsonify(payload), 200

@app.route('/upload', methods=['POST'])
def upload_document():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)

    raw_text = extract_text_from_pdf(file_path)
    if not raw_text.strip():
        return jsonify({"error": "We couldn't extract text from that PDF."}), 400

    text_chunks = chunk_text(raw_text)
    if not text_chunks:
        return jsonify({"error": "The PDF did not produce any retrievable chunks."}), 400

    db = next(get_db())
    existing_doc = db.query(Document).filter(Document.filename == filename).first()
    if existing_doc:
        db.delete(existing_doc)
        db.commit()

    new_doc = Document(filename=filename, upload_date=utc_timestamp())
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    for chunk in text_chunks:
        vector = get_embedding(chunk)
        new_embedding = Embedding(document_id=new_doc.id, text_chunk=chunk, vector=vector)
        db.add(new_embedding)
    
    db.commit()
    return jsonify({"message": "File processed successfully", "doc_id": new_doc.id}), 200

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_question = data.get("question")
    if not user_question:
        return jsonify({"error": "No question provided"}), 400

    try:
        query_vector = get_embedding(user_question)
        db = next(get_db())
        results = db.query(Embedding).order_by(
            Embedding.vector.cosine_distance(query_vector)
        ).limit(3).all()

        if not results:
            return jsonify({"answer": "I don't have any documents in memory."})

        context_text = "\n\n".join([r.text_chunk for r in results])
        prompt = f"Context:\n{context_text}\n\nQuestion: {user_question}\nAnswer using ONLY the context."
        
        response = gemini_model.generate_content(prompt)
        
        return jsonify({
            "answer": response.text,
            "citations": list(set([r.document.filename for r in results]))
        })
    except Exception as e:
        print(f"CHAT ERROR: {str(e)}")
        return jsonify({"error": "AI error. Please try again."}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
