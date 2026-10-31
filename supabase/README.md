# ParkZone Supabase & Resend Setup

This directory contains the database schema, edge functions, and configuration for ParkZone.

---

## 1. Database Schema (`schema.sql`)

The [`schema.sql`](file:///Users/macbook/Documents/Dev/ParkZone/supabase/schema.sql) file contains the full relational schema tailored to ParkZone:

* **`profiles`**: Linked to Supabase Auth (`auth.users`), manages phone numbers, emails, and roles (`driver`, `operator`, `admin`).
* **`vehicles`**: Tracks registered vehicles (`plate_number`, `make_model`, `color`, `is_default`).
* **`parking_locations`**: Manages parking areas, coordinates (`latitude`, `longitude`), total & available spots, hourly pricing (`RWF`), and QR code identifiers.
* **`parking_tickets`**: Records parking sessions, vehicle plates, entry/exit timestamps, QR token, and payment statuses.
* **`email_logs`**: Tracks emails dispatched via Resend (with Resend Message IDs and status).
* **Triggers**:
  * `handle_new_user`: Automatically creates a `profiles` record whenever a user signs up.
  * `handle_updated_at`: Automatically updates `updated_at` timestamps on row modifications.
* **Row Level Security (RLS)**: Policies configured for user privacy and administrative control.

### How to Apply the Schema:
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to the **SQL Editor**.
3. Copy the contents of [`supabase/schema.sql`](file:///Users/macbook/Documents/Dev/ParkZone/supabase/schema.sql) and paste it into the editor.
4. Click **Run**.

### Existing project databases

If the project already has tables, apply only the needed migration rather than rerunning the full schema:

1. Open the project's **SQL Editor**.
2. Run [`migrations/20261031104500_create_ev_charging_points.sql`](./migrations/20261031104500_create_ev_charging_points.sql).
3. Confirm `public.ev_charging_points` exists in **Table Editor**.
4. Retry the app's charger query. An HTTP `200` with an empty array means the API connection and table are working; add charger rows to show stations from the database.

This migration grants public read access to charger listing fields, but no public write access. Charger commands and meter readings still require a trusted charger backend.

---

## 2. Resend Email Integration (`send-otp-email`)

The Edge Function [`supabase/functions/send-otp-email/index.ts`](file:///Users/macbook/Documents/Dev/ParkZone/supabase/functions/send-otp-email/index.ts) uses [Resend](https://resend.com) to deliver branded emails.

### Steps to Configure Resend:

1. **Sign up at [Resend](https://resend.com)** and generate an API key (`re_...`).
2. **Set secrets in Supabase**:
   Using the Supabase CLI:
   ```bash
   supabase secrets set RESEND_API_KEY=re_your_api_key
   supabase secrets set FROM_EMAIL="ParkZone <onboarding@resend.dev>"
   ```
   *Or in your Supabase Dashboard: Go to **Project Settings** -> **Edge Functions** -> **Add Secret**.*

3. **Deploy the function**:
   ```bash
   supabase functions deploy send-otp-email
   ```

### Development Mode:
If `RESEND_API_KEY` is not set during local testing, the function will generate the OTP and print it to the Edge Function logs without failing.
