import os
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
    text_chunks = chunk_text(raw_text)

    db = next(get_db())
    new_doc = Document(filename=filename, upload_date="2024-01-24") 
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