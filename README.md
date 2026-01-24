# ReSource: High-Precision Neural Engine

ReSource is a full-stack **Retrieval-Augmented Generation (RAG)** platform that enables users to ground Large Language Models in private, technical, or academic datasets. Unlike standard LLMs that often hallucinate on private or niche data, ReSource implements a complex infrastructure of local vectorization, semantic similarity search, and high-dimensional database management to eliminate hallucinations and provide mathematically verifiable answers.

## The RAG Pipeline
ReSource utilizes a modern RAG pipeline to bridge the gap between static file storage and generative AI, differentiating itself from basic chatbots by implementing the following technical pipeline:

1. **Document Fragmentation:** Raw PDFs are ingested and programmatically decomposed into granular text chunks.
2. **Local Vectorization:** The system runs a local **Hugging Face (`all-MiniLM-L6-v2`)** transformer model on the backend. This model converts human language into 384-dimensional floating-point vectors. **This math happens on your server, not in the cloud.**
3. **Vector Indexing:** These embeddings are stored in a **PostgreSQL** instance utilizing the **`pgvector`** extension.
4. **Semantic Querying:** When a user asks a question, the system does not send the question to Gemini yet. Instead, it performs a **Cosine Distance similarity search** against the local database to find the "Nearest Neighbors" (the most relevant paragraphs).
5. **Context Injection:** Only the relevant "ground truth" data is then injected into the LLM prompt, forcing the AI to answer based on your specific documents rather than its general training data.

## Tech Stack

* **Languages:** Python 3.11 (Backend), TypeScript (Mobile)
* **AI/ML Infrastructure:** Hugging Face Transformers (Local Embedding Generation), Google Gemini (Generation Layer)
* **Vector Database:** PostgreSQL 16 + `pgvector` (High-Dimensional Search)
* **Mobile Frontend:** React Native, Expo, NativeWind (Tailwind), React Navigation
* **Data Processing:** SQLAlchemy (ORM), `pypdf` (Extraction), Axios
* **Orchestration:** Docker & Docker Compose
* **Testing:** PyTest (Unit testing for chunking logic)

## Project Structure

```text
ReSource/
├── backend/              # Logic & Data Layer
│   ├── tests/            # PyTest Suite for Logic Verification
│   ├── uploads/          # Physical storage for PDF ingestion
│   ├── app.py            # Flask API & Context Injection logic
│   ├── models.py         # SQLAlchemy & Vector Schema
│   ├── utils.py          # Local NLP & Extraction Engine
│   └── Dockerfile        # Backend Containerization
├── mobile/               # Interface Layer
│   ├── src/screens/      # RAG-aware Chat & Upload UI
│   ├── App.tsx           # Navigation Controller
│   └── env.d.ts          # Environment Type Definitions
├── .github/              # Actions for Automated Testing
├── docker-compose.yaml   # Infrastructure Orchestration
└── run.ps1               # Automated Master Launch Script
```

## Getting Started

### 1. Environment Configuration
Create a `.env` file in the root directory for the AI credits:
`GOOGLE_API_KEY=your_gemini_key`

Create a `.env` file in the `mobile/` directory for the local gateway:
`API_URL=http://your_internal_ip:5000`

### 2. Infrastructure Deployment
Run the master script to spin up the local AI worker, the Vector DB, and the Mobile Bundler:
`.\run.ps1`

## System Features

### Local Semantic Search
The core of ReSource is its ability to find information without keywords. By using vector math, the system understands that a query about "The Law of the Land" should retrieve paragraphs about the "Constitution," even if the specific words don't match.

### Verifiable Source Citations
The system maps every response to a specific document ID in the database. When the AI answers, the system cross-references the vector metadata to tell the user exactly which file provided the information, creating a transparent "Chain of Thought."

### Air-Gapped Metadata Processing
By generating embeddings locally on the Python server using Sentence-Transformers, the system keeps the primary "understanding" of your documents within your own infrastructure, only using the cloud LLM as a final synthesis tool.


## CI/CD
The project uses GitHub Actions to verify the data processing pipeline. Every commit triggers a series of unit tests that validate the recursive character-splitting logic and the integrity of the vector-generation functions, ensuring that the "Brain" remains accurate as the codebase grows.