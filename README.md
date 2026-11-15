# Personal AI Agent

A full-stack AI assistant: chat, voice, tool-using agent, memory, tasks, files, and scheduled automations.

- **Frontend:** React + TypeScript + Tailwind CSS + Framer Motion + Lucide
- **Backend:** Python FastAPI + SQLAlchemy (SQLite for dev, PostgreSQL for production)
- **AI:** any OpenAI-compatible LLM via function calling. The key stays on the server.

## Quick start

### 1. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # then edit .env and set OPENAI_API_KEY
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api to :8000)
```
Open http://localhost:5173, create an account, and start chatting.

**Single-server mode:** run `npm run build` in `frontend/`, then start only the backend. FastAPI serves `frontend/dist` at http://localhost:8000.

### 3. Tests
```bash
cd backend && python -m pytest -q
```

## Configuration (`backend/.env`)

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM key (server-side only). Without it the agent shows "offline". |
| `OPENAI_BASE_URL`, `LLM_MODEL` | Swap in another OpenAI-compatible provider or model. |
| `DATABASE_URL` | `sqlite:///./data/agent.db` (default) or `postgresql+psycopg2://user:pass@host/db` (`pip install psycopg2-binary`). |
| `JWT_SECRET` | Token signing secret. Auto-generated and saved in `data/` if unset. |
| `CORS_ORIGINS` | Allowed frontend origins. |
| `DESKTOP_AUTOMATION`, `DESKTOP_ALLOWED_APPS` | Opt-in desktop module (see below). |

## What is implemented

| Area | Details |
|---|---|
| Chat | Real LLM replies, history, new/delete/clear, copy, regenerate, Markdown + code highlighting, file and image attachments (images go to vision-capable models; PDF/text are extracted), error messages, typing animation. |
| Languages | English and Telugu, including Telugu typed in English letters (handled by the system prompt). |
| Agent brain | Intent understanding, `make_plan` for complex requests, multi-step tool loop (max 6 steps), function calling, error recovery, token-limit trimming and retry, per-step activity log. |
| Tools | Web search, calculator + unit conversion, tasks/reminders, memory, list/read/create-folder/rename/organize files, create TXT/MD/PDF documents, project scaffolding, open website/app. |
| Verification | Tools check their own results (file exists, PDF re-opened, etc.) and return `ok`. The agent is instructed never to claim success unless `ok=true`; failures and disabled tools are reported. |
| Approvals | Sensitive tools (save memory, rename/organize files, scaffold project, open website/app) are queued. Nothing runs until you click **Approve** in chat or Agent Workspace; **Cancel** discards it. |
| Voice | Browser Web Speech API for speech-to-text and text-to-speech, listening/speaking animation, mute, conversation mode (auto re-listen), English and Telugu. Optional `/api/voice/transcribe` (Whisper) for server-side STT. |
| Memory | View, add, edit, delete, clear, enable/disable. Used in prompts only when enabled. |
| Tasks | CRUD, priorities, due dates, real reminders (in-app toast + browser notification while the app is open). |
| Files | Per-user sandbox folder: browse, upload, rename, folders, view, delete (UI only, with confirmation). Path traversal is blocked. |
| Automations | Interval schedules (reminder or agent prompt), pause/resume, enable/disable, run now, execution history. Runs in a background scheduler inside the API process. |
| Security | scrypt password hashing, JWT auth on every route, per-user data isolation, input validation, upload type/size limits, rate limiting, API key never sent to the browser, no shell execution of model output. |
| Pages | Dashboard, AI Chat, Voice, Agent Workspace, Tasks, Files, Automations, Memory, History, Settings, Profile. |

## Desktop automation (optional, off by default)

Set `DESKTOP_AUTOMATION=true` in `backend/.env`. The agent can then request `open_website` (http/https only) and `open_app` (only names in `DESKTOP_ALLOWED_APPS`, launched without a shell). Every call needs your approval first. It acts on the machine running the backend, so use it when the backend runs on your own PC. There is no arbitrary command execution, and the agent has no delete tool.

## Known limits (honest notes)

- **Replies are not token-streamed.** The full answer arrives, then the typing animation plays in the browser. Server-sent streaming can be added in `routers/chat.py` and `orchestrator.py`.
- **Web search** scrapes DuckDuckGo's HTML page, which can block or change. Swap `web_search` in `agent/tools.py` for Tavily, Serper or Bing for production reliability.
- **Reminders** notify only while the app is open in a browser tab (no push/email yet).
- **Rate limiting** is in-memory per process. Use Redis if you run several workers.
- **Tables** are created with `create_all`. Add Alembic migrations before changing the schema in production.
- **Telugu speech** needs a browser/OS voice pack for `te-IN`; Chrome on Android and Windows with Telugu installed work best.
- The agent's chat, search and PDF features were tested without a live LLM key (backend tests cover auth, isolation, sandboxing, calculator, approvals, PDF creation). Add your key and try a few prompts to confirm your provider's behavior.

## Project layout
```
backend/app/
  main.py  config.py  db.py  models.py  security.py
  agent/orchestrator.py   # LLM loop, approvals
  agent/tools.py          # tool registry (add new tools here)
  routers/                # auth, chat, agent, data (tasks/memory/files/dashboard/voice), automations
backend/tests/
frontend/src/
  pages/  components/  api.ts  auth.tsx  speech.ts
```

## Adding a tool
In `agent/tools.py`:
```python
@tool("my_tool", "What it does", {"arg": S("Description")}, ["arg"], sensitive=True)
def my_tool(c: Ctx, arg): ...; return {"ok": True, "summary": "Did it"}
```
It is automatically exposed to the model and shown in the Agent Workspace.
