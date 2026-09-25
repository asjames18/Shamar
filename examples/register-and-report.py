#!/usr/bin/env python3
"""
Example client: registers an agent, sends a heartbeat, and submits events.
Zero dependencies — uses only the Python standard library (urllib, json, os, sys).

Usage:
  set AGENTOS_DEV_API_KEY=dev-local-key-change-me
  python examples/register-and-report.py
  # or: python examples/register-and-report.py [api-base-url] [api-key]
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def resolve_base() -> str:
    if len(sys.argv) > 1 and sys.argv[1].strip():
        return sys.argv[1].rstrip("/")
    return (
        os.environ.get("SHAMAR_BASE_URL")
        or os.environ.get("API_BASE_URL")
        or "http://localhost:4000"
    ).rstrip("/")


def resolve_key() -> str:
    if len(sys.argv) > 2 and sys.argv[2].strip():
        return sys.argv[2]
    return os.environ.get("SHAMAR_API_KEY") or os.environ.get("AGENTOS_DEV_API_KEY") or ""


BASE = resolve_base()
KEY = resolve_key()

if not KEY:
    print(
        "Set SHAMAR_API_KEY or AGENTOS_DEV_API_KEY (see .env.example) "
        "or pass the key as argv[2].",
        file=sys.stderr,
    )
    sys.exit(1)


def api(method: str, path: str, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        method=method,
        headers={
            "content-type": "application/json",
            "x-api-key": KEY,
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            payload = res.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> {err.code}: {err_body}") from err


def main() -> None:
    # 1. Register the agent (idempotent-ish: reuse by name if it already exists)
    existing = api("GET", "/api/agents")
    agent = next((a for a in existing.get("agents", []) if a.get("name") == "Research Agent"), None)
    if not agent:
        created = api(
            "POST",
            "/api/agents",
            {
                "name": "Research Agent",
                "description": "Researches topics and drafts briefs",
                "department": "Marketing",
                "owner": "demo-owner",
                "provider": "ollama-local",
                "model": "qwen3:8b",
                "status": "active",
                "tools": ["web_search"],
                "permissions": ["read:web"],
                "autonomy_level": 2,
            },
        )
        agent = created["agent"]
        print("registered agent:", agent["id"])
    else:
        print("reusing agent:", agent["id"])

    # 2. Heartbeat — tells the control plane the agent is alive
    api("POST", f"/api/agents/{agent['id']}/heartbeat")
    print("heartbeat sent")

    # 3. Submit events as the agent works
    api(
        "POST",
        "/api/events",
        {
            "agent_id": agent["id"],
            "type": "agent.started",
            "summary": "Research Agent started its shift",
        },
    )
    api(
        "POST",
        "/api/events",
        {
            "events": [
                {
                    "agent_id": agent["id"],
                    "type": "model.called",
                    "summary": "Summarized 3 articles",
                    "data": {"model": "qwen3:8b", "provider": "ollama"},
                    "tokens_in": 1840,
                    "tokens_out": 320,
                    "duration_ms": 2100,
                },
                {
                    "agent_id": agent["id"],
                    "type": "task.completed",
                    "summary": "Drafted competitive brief",
                    "duration_ms": 47000,
                },
            ],
        },
    )
    print("events submitted (agent.started, model.called, task.completed)")

    # 4. Show the dashboard summary + detail link
    summary = api("GET", "/api/dashboard/summary")
    print("dashboard:", json.dumps(summary, indent=2))
    web_base = BASE.replace(":4000", ":3000")
    print(f"\nagent id: {agent['id']}")
    print(f"Open {web_base} and click the agent to open the detail view.")
    print(f"API detail: {BASE}/api/agents/{agent['id']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:  # noqa: BLE001 — top-level example CLI
        print(f"example failed: {err}", file=sys.stderr)
        sys.exit(1)
