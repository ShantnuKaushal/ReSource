# ReSource

ReSource is a browser-first retrieval workspace for grounding answers in private PDFs. You upload a document through the frontend app, the Flask backend extracts and chunks the text, generates local embeddings with `all-MiniLM-L6-v2`, stores them in PostgreSQL with `pgvector`, and only then asks Gemini to answer against the retrieved context.

This version removes the old Expo/React Native client and replaces it with a mobile-web Next.js interface designed for a calmer, more precise research workflow.

## Stack

### Backend
- Python 3.11
- Flask + Flask-CORS
- SQLAlchemy
- PostgreSQL 16 + `pgvector`
- `sentence-transformers` with `all-MiniLM-L6-v2`
- Google Gemini via `google-generativeai`
- `pypdf`

### Frontend
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Vitest + Testing Library

### Tooling
- Docker + Docker Compose for the backend stack
- GitHub Actions for backend tests

## Product Flow

1. Upload a PDF from the frontend workspace.
2. The backend extracts text from the file and splits it into fixed-size chunks.
3. Each chunk is embedded locally using `all-MiniLM-L6-v2`.
4. The embeddings are stored in PostgreSQL using the `vector` column type from `pgvector`.
5. When you ask a question, the backend embeds the question, retrieves the nearest chunks by cosine distance, and asks Gemini to answer using only those retrieved chunks.
6. The UI shows the answer with filename-level citations.

## Project Structure

```text
ReSource/
├── backend/               # Flask API, database models, PDF processing, retrieval logic
├── frontend/              # Next.js browser client
├── .github/workflows/     # CI for backend tests
├── docker-compose.yml     # PostgreSQL + Flask backend
```

## Environment Setup

### Root `.env`

Create a root `.env` file:

```env
GOOGLE_API_KEY=your_gemini_api_key_here
```

### Frontend `.env.local`

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

If you are testing from another device on the same network, use your machine's LAN IP instead of `localhost`.

## Running The Project

### Option 1: Recommended manual startup

Start the backend stack:

```powershell
docker compose up -d --build
```

Then start the frontend app:

```powershell
cd frontend
cmd /c npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful Commands

### Backend logs

```powershell
docker compose logs -f api
```

### Database logs

```powershell
docker compose logs -f db
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

### Production build check

```powershell
cd frontend
cmd /c npm run build
```

## API Surface

### `GET /documents`
Returns the currently indexed documents for the workspace UI.

### `POST /upload`
Accepts a PDF as multipart form data and stores its chunks and embeddings.

### `POST /chat`
Accepts `{ "question": "..." }` and returns a grounded answer plus citations.

## Testing

### Backend
GitHub Actions runs backend pytest coverage for chunking logic.

### Frontend
Vitest covers the main workspace states:
- empty library state
- missing file validation
- failed upload state
- failed chat state
