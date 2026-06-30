import json
import os
from pathlib import Path
from typing import AsyncGenerator

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY", "")
CEREBRAS_MODEL = os.getenv("CEREBRAS_MODEL", "gpt-oss-120b")
CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions"

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Chatflow", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "model": CEREBRAS_MODEL,
        "configured": bool(CEREBRAS_API_KEY),
    }


@app.get("/api/models")
async def list_models():
    if not CEREBRAS_API_KEY:
        raise HTTPException(status_code=500, detail="CEREBRAS_API_KEY is not set.")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            "https://api.cerebras.ai/v1/models",
            headers={"Authorization": f"Bearer {CEREBRAS_API_KEY}"},
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


@app.post("/api/chat")
async def chat(request: ChatRequest):
    if not CEREBRAS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="CEREBRAS_API_KEY is not set. Copy .env.example to .env and add your key.",
        )

    if not request.messages:
        raise HTTPException(status_code=400, detail="At least one message is required.")

    payload = {
        "model": CEREBRAS_MODEL,
        "messages": [m.model_dump() for m in request.messages],
        "stream": True,
        "temperature": 0.7,
        "max_tokens": 4096,
    }

    headers = {
        "Authorization": f"Bearer {CEREBRAS_API_KEY}",
        "Content-Type": "application/json",
    }

    async def stream_response() -> AsyncGenerator[str, None]:
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST", CEREBRAS_URL, json=payload, headers=headers
                ) as response:
                    if response.status_code != 200:
                        body = await response.aread()
                        error_text = body.decode("utf-8", errors="replace")
                        yield f"data: {json.dumps({'error': error_text})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            yield "data: [DONE]\n\n"
                            break
                        yield f"data: {data}\n\n"
        except httpx.HTTPError as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
