import asyncio, logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from .config import BASE, settings
from .db import Base, SessionLocal, engine
from .models import Automation, now
from .routers import agent, auth, automations, chat, data

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("agent")
Base.metadata.create_all(engine)


def _tick():
    with SessionLocal() as db:
        due = db.query(Automation).filter(Automation.enabled == True, Automation.paused == False, Automation.next_run <= now()).all()  # noqa: E712
        for a in due:
            log.info("Running automation %s (%s)", a.id, a.name)
            automations.run_and_log(db, a)


async def scheduler():
    while True:
        try:
            await run_in_threadpool(_tick)
        except Exception:
            log.exception("Scheduler error")
        await asyncio.sleep(20)


@asynccontextmanager
async def lifespan(app):
    if not settings.openai_api_key:
        log.warning("OPENAI_API_KEY is not set: the agent will be offline until you add it to backend/.env")
    task = asyncio.create_task(scheduler())
    yield
    task.cancel()


app = FastAPI(title="Personal AI Agent", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
for r in (auth.router, chat.router, agent.router, data.router, automations.router):
    app.include_router(r)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(x) for x in first.get("loc", []) if x != "body")
    return JSONResponse({"detail": f"Invalid input{' (' + loc + ')' if loc else ''}: {first.get('msg', '')}"}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse({"detail": "Something went wrong on the server. Check the backend logs."}, status_code=500)


@app.get("/api/health")
def health():
    return {"ok": True}


# Serve the built frontend (npm run build) from the same server in production.
DIST = BASE.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        f = (DIST / full_path).resolve()
        return FileResponse(f if f.is_file() and DIST in f.parents else DIST / "index.html")
