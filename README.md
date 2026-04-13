# ReSource

ReSource is a browser-first PDF retrieval workspace. It lets you upload PDFs, attach them to a conversation, and ask grounded questions against indexed document content instead of chatting against a model with no local context.

The core retrieval layer is powered by local embeddings generated with `all-MiniLM-L6-v2`, which drives the document search and grounding workflow.

The project is split into a Flask backend for ingestion and retrieval, plus a Next.js frontend for the workspace UI.

## Description

ReSource is built for document-grounded research workflows:

- upload PDFs into a document library
- attach one or more PDFs to the active conversation
- ask questions against the active document set
- generate local embeddings with `all-MiniLM-L6-v2`
- retrieve the most relevant chunks from PostgreSQL via `pgvector`
- generate a final answer from retrieved document context

## Stack

### Backend

- Python
- Flask
- Flask-CORS
- SQLAlchemy
- PostgreSQL 16
- `pgvector`
- `sentence-transformers` with `all-MiniLM-L6-v2`
- `pypdf`

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Vitest
- Testing Library

### Tooling

- Docker / Docker Compose for the local backend stack
- GitHub Actions for backend CI

## Product Flow

1. Start the backend and frontend locally.
2. Upload one or more PDFs from the workspace UI.
3. The backend extracts the PDF text and splits it into chunks.
4. Each chunk is embedded locally with `all-MiniLM-L6-v2`.
5. The embeddings are stored in PostgreSQL using `pgvector`.
6. Create or open a conversation in the workspace.
7. Add the relevant PDFs to that conversation's active context.
8. Ask a question from the frontend.
9. The backend embeds the question and retrieves the nearest chunks for grounded answering.
10. The UI renders the answer along with filename-level citations.

## Project Structure

```text
ReSource/
|-- backend/              Flask API, models, retrieval logic, PDF processing
|-- frontend/             Next.js app and workspace UI
|-- .github/workflows/    CI configuration
|-- docker-compose.yml    Local PostgreSQL + backend stack
|-- .env.example          Root environment template
```

## Setup

### Prerequisites

- Node.js
- npm
- Docker Desktop

### Environment Variables

Create a root `.env` file:

```env
GOOGLE_API_KEY=your_gemini_api_key_here
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

If you want to access the frontend from another device on the same network, replace `localhost` with your machine's LAN IP in `frontend/.env.local`.

## Running The Project

### 1. Start the backend stack

```powershell
docker compose up -d --build
```

This starts:

- PostgreSQL on `localhost:5433`
- Flask API on `http://localhost:5000`

### 2. Start the frontend

```powershell
cd frontend
cmd /c npm run dev
```

The frontend will run on:

- `http://localhost:3000`

## Useful Commands

### Backend logs

```powershell
docker compose logs -f api
```

### Database logs

```powershell
docker compose logs -f db
```

### Stop the backend stack

```powershell
docker compose down
```

### Frontend dev server

```powershell
cd frontend
cmd /c npm run dev
```

### Frontend tests

```powershell
cd frontend
cmd /c npm test
```

### Frontend lint

```powershell
cd frontend
cmd /c npm run lint
```

### Frontend production build check

```powershell
cd frontend
cmd /c npm run build
```

### Backend test run

```powershell
cd backend
pytest
```
