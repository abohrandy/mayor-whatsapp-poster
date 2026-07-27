# Mayor WhatsApp Automation SaaS - Migration & Compatibility Notes

This document details database schema migrations, API refactoring, data preservation rules, and backward-compatibility mechanisms enforced across all upgrades.

---

## 1. Database Schema Migrations

All SQLite table migrations are handled idempotently inside `src/models/database.js` on startup:

1. **Posting Profiles ➔ Audience Lists Migration**:
   - Table `posting_profiles` migrated to `audience_lists`.
   - Existing profile IDs and group JSON configurations were preserved 1:1.
   - Added column `contact_list_ids` (`TEXT DEFAULT '[]'`).
2. **Multi-Destination Announcement Schema Migration**:
   - Added `target_contacts` (`TEXT DEFAULT '[]'`).
   - Added `target_contact_lists` (`TEXT DEFAULT '[]'`).
   - Added `target_audience_lists` (`TEXT DEFAULT '[]'`).
   - Added `include_status` (`INTEGER DEFAULT 0`).
   - Added `caption_variations` (`TEXT DEFAULT '[]'`) and `caption_index` (`INTEGER DEFAULT 0`).
3. **Contact Harvesting & Session Migration**:
   - Added `last_contacts_synced_at` column to `whatsapp_sessions`.
   - Added `contacts`, `contact_lists`, and `contact_list_members` tables.
4. **AI Credit & Super Admin Telemetry Migration**:
   - Added `ai_credits_remaining`, `ai_credits_monthly_limit`, `ai_credits_reset_at` to `users`.
   - Added `ai_credit_logs`, `ai_settings`, and `ai_request_logs` tables.
5. **Queue Worker & Job Logs Migration**:
   - Added `jobs` and `job_logs` tables.

---

## 2. Backward Compatibility & Alias Endpoints

- **Posting Profiles Endpoint Aliases**:
  - The legacy API endpoints `/api/profiles` (`GET`, `POST`, `PUT`, `DELETE`) are preserved as aliases routing to `audienceListController`.
  - Frontend components referencing `posting_profiles` or `profiles` continue working without modification.
- **Single Destination Announcement Compatibility**:
  - Existing group-only announcements automatically populate `target_groups` and default `target_contacts`, `target_contact_lists`, and `include_status` without breaking legacy schedulers.
- **AI White-Labeling**:
  - Standard user endpoints (`/api/ai/credits`, `/api/ai/usage-history`) conceal all underlying LLM model names and providers, preserving white-labeled brand experience.

---

## 3. Data Integrity & Verification Protocol

Before releasing updates to production:
1. Run `node -c` across all backend JavaScript modules (`0` errors required).
2. Run `npm run build` in the `admin-dashboard/` folder (`0` compilation errors required).
3. Verify that database migrations do NOT drop any existing tables or columns.
