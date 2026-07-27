# WhatsApp Group Poster — Product Features & USPs

**WhatsApp Group Poster** is a premium, multi-account SaaS marketing tool designed for businesses and individuals looking to coordinate and automate outreach across multiple WhatsApp groups without triggering account suspensions. It is built with a sleek, responsive dark-mode/light-mode dashboard and incorporates robust anti-spam protections.

---

## 🚀 Key Features Breakdown

### 1. Multi-Account WhatsApp Session Management
* **Instant QR Code Linkage**: Scan a QR code dynamically generated via Baileys and link any WhatsApp account to the dashboard in seconds.
* **Session Isolation & Multi-number Support**: Connect and switch between multiple WhatsApp sender accounts to isolate campaigns or scale volume.
* **Independent Account Limits**: Controls limits on active linked numbers based on the user's subscription tier.

### 2. Smart Scheduling & Recurrence Engine
* **Flexible Posting Schedules**: Queue announcements to post immediately, at a specific date and time, or on a recurring basis.
* **Intelligent Recurrence**: Set messages to send automatically every N days or only on specific days of the week (e.g., Mondays, Wednesdays, and Fridays).
* **Timezone Safety**: Uses time zones (defaulting to Africa/Lagos) to schedule posts precisely when the target audience is active.

### 3. Anti-Spam & Deliverability Suite (USPs)
* **Caption Spin-Tax (caption variations)**: Add multiple alternative captions to a single announcement. The app will automatically cycle through the variations on subsequent posts to keep content looking fresh and avoid WhatsApp's bot-detection algorithms.
* **Dynamic Media Rotator**: Upload multiple images or videos; the scheduler rotates the attached media with every post sequence to ensure uniqueness.
* **Normalized Content Rate-Limiting**: A background SHA-256 hashing service blocks accounts from posting identical text to prevent reckless spamming (enforced at 12 hours for Trial users and 6 hours for Premium users).
* **Controlled Message Staggering**: Integrates a configurable send-delay between groups to avoid sending a burst of messages simultaneously, keeping account flags low.

### 4. Group Collections & Audience Lists
* **Custom Group Sets**: Save collections of WhatsApp groups under target "Audience Lists" (e.g., "Real Estate Groups," "Tech Groups").
* **Bulk Scheduling**: Select an audience list when creating an announcement to queue messages to all groups in that list with one click.
* **Live Chat/Group Fetching**: Automatically imports all active groups that the sender account is part of, making selections fast and seamless.

### 5. SaaS Subscription & Admin Controls
* **Dynamic Subscription System**: Configure dynamic packages directly from the admin interface. Admin can adjust pricing, plan duration, maximum group limits, allowed session counts, and rate limits.
* **Integrated Paystack Checkout**: Allows seamless, secure subscription billing via Paystack with dynamic webhook automation to activate/renew packages.
* **Free Trial Lifecycle**: Users can activate a self-service 14-day trial with built-in feature restrictions.
* **Detailed Audit & Activity Logs**: A detailed activity log tracks post creations, status toggles, plan adjustments, and subscription changes for accountability.
* **Super Admin Controls**: Super admins can directly adjust active tiers, suspend users, or toggle subscriptions manually.

---

## 💎 Unique Selling Points (USPs)

| Feature | The Competition | WhatsApp Group Poster |
| :--- | :--- | :--- |
| **Spam Protection** | Send identical copy repeatedly, leading to immediate WhatsApp phone number bans. | **Cycle & Rotate**: Cycles alternative captions and rotates media dynamically so no two sequential posts are identical. |
| **Pacing Control** | Send all messages at once, triggering WhatsApp's network-abuse firewalls. | **Send Delay Staggering**: Customisable delay spacing between messages to simulate organic human activity. |
| **Billing Flexibility** | Hardcoded plans requiring developer updates. | **Dynamic Plans Control**: Add, change, or remove subscription tiers directly from the Admin Dashboard in seconds. |
| **Design / Aesthetics** | Basic, old-school layout. | **Premium Glassmorphism**: Interactive dark/light mode with sleek glass cards, rich micro-animations, and fluid responsive design. |

---

## 🛠️ Technology Stack
* **Backend**: Node.js + Express with modular controllers and SQLite database for fast, atomic operations.
* **WhatsApp Bridge**: Baileys (the leading lightweight, low-overhead native WhatsApp Web API wrapper).
* **Frontend**: React + TypeScript + Vite + Tailwind CSS + Lucide Icons.
* **Payments**: Paystack API with automatic Webhook verification.
