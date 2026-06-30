# Chatflow

A sleek AI chatbot powered by [Cerebras Inference](https://inference-docs.cerebras.ai/), with local chat history saved in your browser.

## Setup

1. **Install dependencies**

   ```bash
   cd ~/Projects/chatflow
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Add your Cerebras API key**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set your key:

   ```
   CEREBRAS_API_KEY=your_key_here
   CEREBRAS_MODEL=gpt-oss-120b
   ```

3. **Run the app**

   ```bash
   source .venv/bin/activate
   uvicorn main:app --reload --port 8000
   ```

4. Open **http://localhost:8000** in your browser. (for as now idk if it works BUT i will get a git link soon)

## Features

- Streaming responses from Cerebras
- Dark, modern UI with markdown rendering
- Sidebar with saved conversations (stored in localStorage)
- New chat, switch chats, delete chats
- Mobile-friendly layout

## Models

Set `CEREBRAS_MODEL` in `.env` to any model available on your Cerebras account, e.g.:

- `gpt-oss-120b` (default)
- `zai-glm-4.7`

See the [Cerebras model docs](https://inference-docs.cerebras.ai/models/overview) for the full list.
