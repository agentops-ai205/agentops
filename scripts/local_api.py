#!/usr/bin/env python3
import hashlib
import json
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
STORE_PATH = ROOT / ".agentops" / "local-store.json"


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def prefixed(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def password_hash(password):
    return hashlib.sha256(f"agentops-local:{password}".encode()).hexdigest()


def default_agents(organization_id):
    return [
        {"id": "agent.planner", "organizationId": organization_id, "role": "planner", "name": "Mission Planner", "status": "available", "createdAt": now()},
        {"id": "agent.coder", "organizationId": organization_id, "role": "coder", "name": "Controlled Coder", "status": "available", "createdAt": now()},
        {"id": "agent.tester", "organizationId": organization_id, "role": "tester", "name": "Verification Tester", "status": "available", "createdAt": now()},
    ]


def default_policies(organization_id):
    return [
        {"id": "policy.local_approval", "organizationId": organization_id, "name": "Human approval before risky work", "decision": "require_approval", "severity": "high", "createdAt": now()},
        {"id": "policy.local_evidence", "organizationId": organization_id, "name": "Evidence required for mission changes", "decision": "require_evidence", "severity": "medium", "createdAt": now()},
    ]


def load_store():
    if STORE_PATH.exists():
        data = json.loads(STORE_PATH.read_text())
        data.setdefault("users", [])
        data.setdefault("sessions", [])
        return data
    org = {"id": "org.default", "name": "Local AgentOps", "plan": "local", "createdAt": now(), "updatedAt": now()}
    project = {
        "id": "com.agentops.local",
        "organizationId": org["id"],
        "name": "Local workspace",
        "type": "agentic_operations",
        "criticality": "medium",
        "owners": {},
        "repos": [f"local:{ROOT}"],
        "createdAt": now(),
        "updatedAt": now(),
    }
    return {
        "organization": org,
        "project": project,
        "missions": [],
        "agents": default_agents(org["id"]),
        "policies": default_policies(org["id"]),
        "approvals": [],
        "evidence": [],
        "audit": [],
        "memory": [],
        "evaluations": [],
        "improvements": [],
        "patches": [],
        "jobs": [],
        "users": [],
        "sessions": [],
    }


def save_store(store):
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(store, indent=2) + "\n")


def audit(store, event_type, reason, mission_id=None, actor_id="system", metadata=None):
    store["audit"].insert(0, {
        "id": prefixed("audit"),
        "organizationId": store["organization"]["id"],
        "projectId": store["project"]["id"],
        "missionId": mission_id,
        "actorId": actor_id,
        "eventType": event_type,
        "reason": reason,
        "result": "recorded",
        "metadata": metadata or {},
        "createdAt": now(),
    })


def public_user(user):
    return {
        "id": user["id"],
        "organization_id": user["organizationId"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "language": user["language"],
    }


def bearer(headers):
    auth = headers.get("authorization", "")
    return auth[7:].strip() if auth.startswith("Bearer ") else ""


def user_for_token(store, token):
    session = next((item for item in store["sessions"] if item["token"] == token), None)
    if not session:
        return None
    return next((item for item in store["users"] if item["id"] == session["userId"]), None)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "authorization,content-type")
        self.send_header("access-control-allow-methods", "GET,POST,PUT,OPTIONS")
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        size = int(self.headers.get("content-length", "0"))
        return json.loads(self.rfile.read(size) or b"{}")

    def do_OPTIONS(self):
        self._json({"ok": True})

    def do_GET(self):
        store = load_store()
        path = urlparse(self.path).path
        if path in ["/live", "/api/live"]:
            return self._json({"ok": True, "service": "agentops-local-api", "environment": "local_json"})
        if path in ["/health", "/api/health"]:
            return self._json({"ok": True, "service": "agentops-local-api", "environment": "local_json", "database": "local_json", "checks": {"database": True, "rust_core": True, "policy_engine": "local", "sandbox_engine": "local"}})
        if path in ["/v1/auth/me", "/api/v1/auth/me"]:
            user = user_for_token(store, bearer(self.headers))
            if not user:
                return self._json({"error": {"code": "SESSION_EXPIRED", "message": "Session expired."}}, 401)
            return self._json({"user": public_user(user), "organization": store["organization"]})
        if path in ["/v1/overview", "/api/v1/overview"]:
            return self._json({key: store.get(key, []) for key in ["organization", "project", "missions", "agents", "policies", "approvals", "evidence", "audit", "memory", "evaluations", "improvements", "patches", "jobs"]})
        if path in ["/v1/tools", "/api/v1/tools"]:
            return self._json([{"id": "tool.local", "name": "Local tool registry", "risk": "low"}])
        if path in ["/v1/model-providers", "/api/v1/model-providers"]:
            return self._json([{"id": "manual", "kind": "manual", "capabilities": ["human_in_loop"]}])
        return self._json({"error": "Not found"}, 404)

    def do_POST(self):
        store = load_store()
        path = urlparse(self.path).path
        body = self._body()
        if path in ["/v1/auth/signup", "/api/v1/auth/signup"]:
            email = body["email"].strip().lower()
            if any(user["email"] == email for user in store["users"]):
                return self._json({"error": {"message": "This email is already registered."}}, 409)
            org = {"id": prefixed("org"), "name": body["organization_name"], "plan": "local", "createdAt": now(), "updatedAt": now()}
            project = {"id": f"com.agentops.{uuid.uuid4().hex[:6]}", "organizationId": org["id"], "name": f"{body['organization_name']} workspace", "type": "agentic_operations", "criticality": "medium", "owners": {"product": email, "technical": email}, "repos": [f"local:{ROOT}"], "createdAt": now(), "updatedAt": now()}
            user = {"id": prefixed("usr"), "organizationId": org["id"], "email": email, "name": body["name"], "passwordHash": password_hash(body["password"]), "role": "owner", "language": body.get("language", "en"), "status": "active", "createdAt": now(), "updatedAt": now()}
            token = f"aos_local_{uuid.uuid4().hex}"
            store.update({"organization": org, "project": project, "users": [user], "sessions": [{"id": prefixed("ses"), "token": token, "userId": user["id"], "createdAt": now()}], "missions": [], "agents": default_agents(org["id"]), "policies": default_policies(org["id"]), "approvals": [], "evidence": [], "audit": [], "memory": [], "evaluations": [], "improvements": [], "patches": [], "jobs": []})
            audit(store, "local_user_signup", "Local workspace created", actor_id=user["id"])
            save_store(store)
            return self._json({"token": token, "user": public_user(user), "organization": org, "project": project}, 201)
        if path in ["/v1/auth/login", "/api/v1/auth/login"]:
            email = body["email"].strip().lower()
            user = next((item for item in store["users"] if item["email"] == email), None)
            if not user or user["passwordHash"] != password_hash(body["password"]):
                return self._json({"error": {"message": "Email or password is incorrect."}}, 401)
            token = f"aos_local_{uuid.uuid4().hex}"
            store["sessions"].insert(0, {"id": prefixed("ses"), "token": token, "userId": user["id"], "createdAt": now()})
            save_store(store)
            return self._json({"token": token, "user": public_user(user), "organization": store["organization"]})
        if path in ["/v1/auth/logout", "/api/v1/auth/logout"]:
            token = bearer(self.headers)
            store["sessions"] = [item for item in store["sessions"] if item["token"] != token]
            save_store(store)
            return self._json({"ok": True})
        if path.endswith("/missions"):
            mission = {"id": f"AOS-MIS-{uuid.uuid4().hex[:6].upper()}", "organizationId": store["organization"]["id"], "projectId": store["project"]["id"], "title": body["title"], "intent": body["intent"], "status": "DRAFT", "riskLevel": body.get("risk_level", "medium"), "autonomyLevel": body.get("autonomy_level", 3), "createdAt": now(), "updatedAt": now()}
            store["missions"].insert(0, mission)
            audit(store, "mission_created", mission["intent"], mission_id=mission["id"])
            save_store(store)
            return self._json(mission, 201)
        if "/v1/missions/" in path or "/api/v1/missions/" in path:
            mission_id = path.split("/missions/")[1].split("/")[0]
            mission = next((item for item in store["missions"] if item["id"] == mission_id), None)
            if not mission:
                return self._json({"error": "Mission not found"}, 404)
            if path.endswith("/plan"):
                mission["status"] = "PLANNED"
                mission["plan"] = {"steps": ["Scope work", "Run governed action", "Capture evidence"]}
                audit(store, "mission_planned", "Plan generated", mission_id)
                save_store(store)
                return self._json(mission)
            if path.endswith("/agents/run") or path.endswith("/evaluate"):
                job = {"id": prefixed("job"), "organizationId": store["organization"]["id"], "projectId": store["project"]["id"], "missionId": mission_id, "type": "agent.run" if path.endswith("/agents/run") else "evaluation.run", "status": "queued", "input": body, "createdAt": now()}
                store["jobs"].insert(0, job)
                audit(store, "job_enqueued", job["type"], mission_id, metadata={"job_id": job["id"]})
                save_store(store)
                return self._json({"job": job}, 202)
            if path.endswith("/approve"):
                approval = {"id": prefixed("appr"), "organizationId": store["organization"]["id"], "missionId": mission_id, "approver": body.get("approver", "local"), "role": body.get("role", "owner"), "decision": body.get("decision", "approved"), "scope": body.get("scope", []), "reason": body.get("reason", ""), "createdAt": now()}
                store["approvals"].insert(0, approval)
                mission["status"] = "APPROVED"
                audit(store, "mission_approval", approval["reason"], mission_id)
                save_store(store)
                return self._json(approval)
        if path in ["/v1/evidence", "/api/v1/evidence"]:
            evidence = {"id": prefixed("ev"), "organizationId": store["organization"]["id"], "missionId": body["mission_id"], "type": body.get("type", "report"), "title": body["title"], "content": body["content"], "metadata": body.get("metadata", {}), "createdBy": body.get("created_by", "local"), "hash": hashlib.sha256(json.dumps(body).encode()).hexdigest(), "createdAt": now()}
            store["evidence"].insert(0, evidence)
            audit(store, "evidence_attached", evidence["title"], body["mission_id"])
            save_store(store)
            return self._json(evidence, 201)
        return self._json({"error": "Not found"}, 404)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 3000), Handler).serve_forever()
