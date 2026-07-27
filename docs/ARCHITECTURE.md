# Mayor WhatsApp Automation SaaS - Architecture Documentation

## System Overview

The Mayor WhatsApp Automation SaaS is built on a modular, service-oriented architecture designed for multi-account WhatsApp automation, audience segmentation, AI copywriting, and queue worker dispatching with high reliability.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          React Admin Dashboard                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ REST / WebSockets
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            Express REST API                                 │
└──────┬───────────────────────┬─────────────────────────┬────────────────────┘
       │                       │                         │
┌──────▼────────┐     ┌────────▼────────┐       ┌────────▼────────┐
│  AI Engine    │     │ Queue Workers   │       │  WhatsApp Svc   │
│ (AIService /  │     │ (JobQueue /     │       │ (SessionMgr /   │
│ AICreditMgr)  │     │ QueueWorker)    │       │ BaileysAdapter) │
└──────┬────────┘     └────────┬────────┘       └────────┬────────┘
       │                       │                         │
       │              ┌────────▼────────┐                │
       └─────────────►│DestinationEngine├────────────────┘
                      └────────┬────────┘
                               │
                      ┌────────▼────────┐
                      │ Go WA Bridge /  │
                      │ Baileys Socket  │
                      └─────────────────┘
```

---

## 1. WhatsApp Layer Architecture

- **`WhatsAppService` (`src/whatsapp/WhatsAppService.js`)**:
  - Unified facade wrapping all WhatsApp operations across the application.
  - Manages message sending (text, media, status), contact harvesting, session lifecycle, and group fetching.
- **`BaileysAdapter` (`src/whatsapp/BaileysAdapter.js`)**:
  - Low-level adapter encapsulating all direct HTTP calls to the Go bridge / Baileys socket microservice (`http://127.0.0.1:8080`).
- **`SessionManager` (`src/whatsapp/SessionManager.js`)**:
  - Manages active user sessions, connection state persistence, reconnection backoffs, and background harvesting initialization upon QR connection.

---

## 2. Destination Engine Architecture

- **`DestinationEngine` (`src/destinations/DestinationEngine.js`)**:
  - Central message distribution orchestrator routing messages to multi-destination targets:
    - **`GroupHandler`**: Delivers messages to WhatsApp group chats with exponential backoff on rate limiting (`420`).
    - **`ContactHandler`**: Delivers direct text/media messages to individual contact JIDs (`@s.whatsapp.net`).
    - **`ContactListHandler`**: Expands contact list segment IDs into individual member contacts and dispatches with configurable staggering delays.
    - **`StatusHandler`**: Posts Text, Image, and Video broadcasts to `status@broadcast`.

---

## 3. Queue Worker & Telemetry Engine

- **`JobQueue` (`src/queue/JobQueue.js`)**: SQLite-backed asynchronous job queue decoupling scheduling from execution.
- **`QueueWorker` (`src/queue/QueueWorker.js`)**: Polling worker engine picking up pending jobs and executing `AnnouncementJobHandler` or `SyncJobHandler`.
- **`JobLogger` (`src/queue/JobLogger.js`)**: Emits structured 5-category telemetry logs:
  1. `automation`: Job lifecycle & target expansion.
  2. `whatsapp`: Socket calls & JID delivery.
  3. `ai`: AI caption processing & variation selection.
  4. `sync`: Contact & group harvesting logs.
  5. `error`: Stack traces & failure causes.

---

## 4. AI Copywriting & Credit System

- **`AIService` (`src/ai/AIService.js`)**:
  - Wraps OpenRouter API calls (`https://openrouter.ai/api/v1/chat/completions`).
  - Supports 7 text operations: `improve`, `rewrite`, `grammar`, `translate`, `expand`, `shorten`, `generate_variations`.
  - Strictly ignores media; processes text captions only.
  - Includes failover model routing (Active Model ➔ Fallback Model).
- **`AICreditManager` (`src/ai/AICreditManager.js`)**:
  - Tracks monthly user credit quotas (`ai_credits_remaining`, `ai_credits_reset_at`).
  - Automatically resets credits monthly.
  - Blocks requests with HTTP 402 when credits are exhausted.
  - Enforces 100% white-label privacy (conceals AI model names from standard users).

---

## 5. Super Admin Control Center

- **`AdminAIDashboard` (`admin-dashboard/src/components/AdminAIDashboard.tsx`)**:
  - Manages OpenRouter API keys, active/fallback model routing, subscription credit quotas, feature cost rules, and global AI enable/disable toggle.
  - Provides real-time spend analytics (Daily/Monthly spend, Tokens, Avg Cost per Request, Top Users leaderboard).
