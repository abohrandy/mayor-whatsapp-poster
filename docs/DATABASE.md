# Mayor WhatsApp Automation SaaS - Database Schema Reference

The database is managed via SQLite (`whatsapp_poster.db`) with dynamic schema migration handlers in `src/models/database.js`.

---

## Table Schemas

### 1. `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | User ID |
| `email` | TEXT | UNIQUE NOT NULL | User account email |
| `password_hash` | TEXT | NOT NULL | Bcrypt password hash |
| `subscription_status` | TEXT | DEFAULT 'inactive' | Status (`active`, `inactive`, `past_due`) |
| `tier` | TEXT | DEFAULT 'trial' | Subscription tier (`trial`, `plus`, `unlimited`) |
| `is_admin` | INTEGER | DEFAULT 0 | Super Admin flag (1 = Admin) |
| `ai_credits_remaining` | INTEGER | DEFAULT 50 | Remaining AI credit balance |
| `ai_credits_monthly_limit` | INTEGER | DEFAULT 50 | Total monthly credit allocation |
| `ai_credits_reset_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Next monthly credit reset timestamp |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Account creation date |

---

### 2. `whatsapp_sessions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Session DB ID |
| `user_id` | INTEGER | FOREIGN KEY(users) | Owner User ID |
| `session_id` | TEXT | UNIQUE NOT NULL | Session identifier string |
| `last_contacts_synced_at` | DATETIME | DEFAULT NULL | Timestamp of last contact harvesting sync |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Session creation timestamp |

---

### 3. `contacts`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Contact ID |
| `user_id` | INTEGER | FOREIGN KEY(users) | Owner User ID |
| `name` | TEXT | NOT NULL | Contact display name |
| `phone_number` | TEXT | NOT NULL | Phone number / JID |
| `profile_pic_url` | TEXT | DEFAULT NULL | WhatsApp profile picture URL |
| `tags` | TEXT | DEFAULT '[]' | JSON array of tag strings |
| `custom_fields` | TEXT | DEFAULT '{}' | JSON map of custom field key-values |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Contact creation timestamp |

---

### 4. `contact_lists` & `contact_list_members`
- **`contact_lists`**: `id`, `user_id`, `name`, `description`, `created_at`.
- **`contact_list_members`**: `id`, `contact_list_id`, `contact_id`.

---

### 5. `audience_lists` (Formerly Posting Profiles)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Audience List ID |
| `user_id` | INTEGER | FOREIGN KEY(users) | Owner User ID |
| `name` | TEXT | NOT NULL | List name |
| `groups` | TEXT | DEFAULT '[]' | JSON array of target group JIDs |
| `contact_list_ids` | TEXT | DEFAULT '[]' | JSON array of target contact list IDs |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

---

### 6. `announcements`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Announcement ID |
| `user_id` | INTEGER | FOREIGN KEY(users) | Owner User ID |
| `title` | TEXT | NOT NULL | Announcement title |
| `caption` | TEXT | DEFAULT NULL | Primary caption text |
| `caption_variations` | TEXT | DEFAULT '[]' | JSON array of caption variations |
| `caption_index` | INTEGER | DEFAULT 0 | Round-robin variation index pointer |
| `media_files` | TEXT | DEFAULT '[]' | JSON array of media file paths |
| `ribbon_index` | INTEGER | DEFAULT 0 | Round-robin media index pointer |
| `target_groups` | TEXT | DEFAULT '[]' | Target group JIDs |
| `target_contacts` | TEXT | DEFAULT '[]' | Target contact JIDs |
| `target_contact_lists` | TEXT | DEFAULT '[]' | Target contact list IDs |
| `target_audience_lists` | TEXT | DEFAULT '[]' | Target audience list IDs |
| `include_status` | INTEGER | DEFAULT 0 | Flag to include WhatsApp Status broadcast |
| `status` | TEXT | DEFAULT 'active' | Announcement status (`active`, `inactive`) |
| `next_post_at` | DATETIME | DEFAULT NULL | Scheduled execution timestamp |

---

### 7. `ai_settings` (Super Admin)
- `id`: PRIMARY KEY (1)
- `openrouter_api_key`: TEXT
- `active_model`: TEXT DEFAULT 'google/gemini-2.5-flash'
- `fallback_model`: TEXT DEFAULT 'openai/gpt-4o-mini'
- `ai_enabled`: INTEGER DEFAULT 1
- `credits_trial`, `credits_plus`, `credits_unlimited`: INTEGER
- `cost_per_feature`: TEXT (JSON)

---

### 8. `jobs` & `job_logs`
- **`jobs`**: `id`, `job_type`, `payload` (JSON), `status` (`pending`, `processing`, `completed`, `failed`), `attempts`, `max_retries`, `error_message`, `user_id`, `created_at`, `updated_at`.
- **`job_logs`**: `id`, `job_id`, `log_type` (`automation`, `whatsapp`, `ai`, `sync`, `error`), `message`, `details` (JSON), `created_at`.
