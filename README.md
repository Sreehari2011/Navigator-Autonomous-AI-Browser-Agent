<div align="center">

# 🌐 Navigator: Autonomous AI Browser Agent

[![Python Version](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://python.org)
[![Framework](https://img.shields.io/badge/Framework-LangGraph-purple)](https://langchain.com/langgraph)
[![Browser](https://img.shields.io/badge/Automation-Playwright-2EAD33)](https://playwright.dev/)
[![Frontend](https://img.shields.io/badge/UI-Next.js%20%7C%20React-black)](https://nextjs.org/)

**A stateful, visually-grounded web agent that navigates the internet autonomously using Semantic Accessibility Trees and real-time CDP streaming.**

</div>

## Architectural Highlights

Most LLM browser agents fail because they parse raw HTML (crashing the context window) and operate blindly. Navigator solves this through advanced systems engineering:

### 1. High-Fidelity Perception Engine (AXTree)
Navigator bypasses brittle CSS selectors and raw HTML. Instead, it extracts the browser's native **Accessibility Tree (AXTree)** via Playwright. This gives the LangGraph reasoning engine a purely semantic, human-readable list of interactive elements (e.g., `[BUTTON: "Submit" - DISABLED]`), resulting in 100% structural grounding and zero token-bloat.

### 2. Zero-Lag CDP Streaming (Observability)
The agent hooks directly into the **Chrome DevTools Protocol (CDP)**, capturing screencast frames natively at the engine level. It streams these frames asynchronously via WebSockets to a custom Next.js UI, providing a real-time video feed of the agent's actions without blocking the Python execution loop.

### 3. Dual-Memory ReAct Orchestration
- **Episodic Session Memory:** Tracks visual stalls ("I clicked but the screen didn't change") to dynamically break out of infinite hallucination loops.
- **Semantic Long-Term Memory (ChromaDB):** Stores and retrieves successful UI interaction patterns (e.g., multi-step dropdown logic) across different browsing sessions.

## Tech Stack
- **AI Orchestration:** LangGraph, LangChain, Ollama/OpenAI API
- **Browser Automation:** Playwright, Chrome DevTools Protocol (CDP)
- **Backend:** FastAPI, WebSockets, aiohttp
- **Frontend:** Next.js, React, Tailwind CSS
- **Vector Database:** ChromaDB

## Quick Start

**1. Install Backend Dependencies**
```bash
cd navigator-cockpit
pip install -r requirements.txt
playwright install chromium
```

**2. Start the FastAPI Backend**
```bash
cd navigator-backend
uvicorn main:app --reload --port 8000
```

**3. Start the Next.js Cockpit**
```bash
cd navigator-frontend
npm install
npm run dev
```

**4. Open http://localhost:3000 to access the Control Cockpit and dispatch the agent.**
