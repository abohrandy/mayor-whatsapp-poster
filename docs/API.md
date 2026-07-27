# Mayor WhatsApp Automation SaaS - REST API Reference

All API routes require Authentication (`Authorization: Bearer <jwt_token>`) except `/api/auth/*`.

---

## 1. Authentication Routes (`/api/auth`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/signup` | POST | Register a new SaaS user account |
| `/api/auth/login` | POST | Authenticate user and receive JWT token |
| `/api/auth/me` | GET | Retrieve current logged-in user profile |

---

## 2. WhatsApp Session Routes (`/api/whatsapp`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/whatsapp/status` | GET | Retrieve current session connection status |
| `/api/whatsapp/qr` | GET | Get active session QR code base64 image |
| `/api/whatsapp/groups` | GET | List WhatsApp groups associated with connected session |
| `/api/whatsapp/sync-contacts` | POST | Trigger manual contact harvesting sync |
| `/api/whatsapp/contact-sync-status` | GET | Check last contact sync timestamp and harvested count |
| `/api/whatsapp/disconnect` | POST | Disconnect active WhatsApp session |

---

## 3. Audience & Contacts Routes

| Endpoint | Method | Description |
|---|---|---|
| `/api/contacts` | GET / POST | List all harvested/custom contacts or create new contact |
| `/api/contacts/:id` | GET / PUT / DELETE | CRUD operations on individual contact |
| `/api/contacts/import` | POST | Bulk import contacts from CSV/vCard |
| `/api/contact-lists` | GET / POST | List or create contact segment lists |
| `/api/contact-lists/:id` | GET / PUT / DELETE | CRUD operations on contact lists |
| `/api/audience-lists` | GET / POST | List or create audience targeting lists |
| `/api/audience-lists/:id` | GET / PUT / DELETE | CRUD operations on audience lists |
| `/api/profiles` | ALL | Backward-compatibility alias for Audience Lists |

---

## 4. Automation & Announcements Routes (`/api/announcements`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/announcements` | GET / POST | List or create automation announcements |
| `/api/announcements/:id` | GET / PUT / DELETE | CRUD operations on announcements |
| `/api/announcements/:id/trigger` | POST | Immediately trigger announcement post |

---

## 5. AI Copywriting Routes (`/api/ai`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/ai/credits` | GET | Get user's remaining AI credits, monthly limit, and reset date |
| `/api/ai/usage-history` | GET | Get user's AI credit transaction log (white-labeled) |
| `/api/ai/process` | POST | Execute AI text operation (`improve`, `rewrite`, `grammar`, `translate`, `expand`, `shorten`, `generate_variations`) |

---

## 6. Queue Workers & Telemetry Routes (`/api/jobs`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/jobs` | GET | List queued, processing, completed, and failed jobs |
| `/api/jobs/:id/logs` | GET | Retrieve 5-category job logs (`automation`, `whatsapp`, `ai`, `sync`, `error`) |
| `/api/jobs/:id/retry` | POST | Reset a failed job back to `pending` status for execution |

---

## 7. Super Admin Control Routes (`/api/admin`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/admin/users` | GET | List registered SaaS users and session counts |
| `/api/admin/users/:id/subscription` | POST | Toggle user subscription status (`active`/`inactive`) |
| `/api/admin/users/:id/tier` | POST | Update user subscription tier (`trial`/`plus`) |
| `/api/admin/stats` | GET | Overview statistics of platform activity |
| `/api/admin/ai-dashboard` | GET | AI spend analytics, top users, tokens, and settings |
| `/api/admin/ai-settings` | POST | Update OpenRouter API Key, active/fallback models, tier credits, feature costs, and global toggle |
| `/api/admin/ai-request-logs` | GET | Audit log of all OpenRouter API requests |
