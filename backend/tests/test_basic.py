import os, tempfile
os.environ["DATA_DIR"] = tempfile.mkdtemp()
os.environ["OPENAI_API_KEY"] = ""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.agent import tools as T
from app.agent.orchestrator import decide, execute_tool
from app.db import SessionLocal
from app.models import Activity, User

c = TestClient(app)


def signup(email="a@b.com"):
    r = c.post("/api/auth/signup", json={"email": email, "password": "password123", "name": "A"})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_auth_required_and_login():
    assert c.get("/api/tasks").status_code == 401
    signup("x@y.com")
    assert c.post("/api/auth/login", json={"email": "x@y.com", "password": "wrong-pass"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "x@y.com", "password": "password123"}).status_code == 200


def test_tasks_isolation():
    h1, h2 = signup("u1@t.com"), signup("u2@t.com")
    tid = c.post("/api/tasks", json={"title": "secret"}, headers=h1).json()["id"]
    assert c.delete(f"/api/tasks/{tid}", headers=h2).status_code == 404
    assert len(c.get("/api/tasks", headers=h2).json()) == 0
    assert c.patch(f"/api/tasks/{tid}", json={"status": "done"}, headers=h1).json()["status"] == "done"


def test_calculator_and_units():
    assert T.safe_eval("sqrt(144)+3^2") == 21
    with pytest.raises(Exception):
        T.safe_eval("__import__('os').system('echo hi')")
    assert round(T.convert_units(None, 1, "km", "mi")["result"], 3) == 0.621
    assert round(T.convert_units(None, 100, "c", "f")["result"]) == 212


def test_file_sandbox():
    h = signup("f@t.com")
    assert c.get("/api/files", params={"path": "../.."}, headers=h).status_code == 403
    assert c.post("/api/files/folder", json={"path": "docs"}, headers=h).status_code == 200
    names = [i["name"] for i in c.get("/api/files", headers=h).json()["items"]]
    assert "docs" in names


def test_chat_offline_message_and_sensitive_flow():
    h = signup("ch@t.com")
    cid = c.post("/api/chat/conversations", headers=h).json()["id"]
    r = c.post(f"/api/chat/conversations/{cid}/messages", json={"content": "hi"}, headers=h)
    assert r.status_code == 503 and "OPENAI_API_KEY" in r.json()["detail"]
    # approval flow: sensitive tool is stored, only runs after approve
    with SessionLocal() as db:
        u = db.query(User).filter_by(email="ch@t.com").first()
        T.create_document(T.Ctx(db, u), "a.txt", "hello")
        a = Activity(user_id=u.id, tool="rename_file", args={"path": "a.txt", "new_path": "b.txt"}, status="pending")
        db.add(a); db.commit()
        assert (T.user_root(u) / "a.txt").exists()
        decide(db, u, a, True)
        assert (T.user_root(u) / "b.txt").exists() and a.status == "success"
        assert execute_tool(db, u, "open_website", {"url": "https://x.com"})["ok"] is False  # desktop disabled


def test_pdf_document_verified():
    with SessionLocal() as db:
        u = db.query(User).first()
        r = T.create_document(T.Ctx(db, u), "r.pdf", "# Title\nBody text")
        assert r["ok"] and "page" in r["summary"]
