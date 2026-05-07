# BreatheOS Supabase Setup

Supabase is used as the online source of truth for premium subscriptions.
Local storage is still used for comfort settings, but paid access should come from the server.

## 1. Create the table

Open your Supabase project SQL editor and run:

```sql
-- use the file at supabase/schema.sql
```

## 2. Add environment variables

Copy these into `.env.local`:

```env
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not put it in frontend code or expose it as `NEXT_PUBLIC_*`.

## 3. Payment flow

Users must be signed in before upgrading. The Paystack transaction metadata stores the signed-in app user id.

After Paystack verifies a successful payment:

1. `/api/paystack/verify` validates the transaction.
2. The server writes the subscription to Supabase.
3. The server mirrors the subscription into the local Prisma profile as fallback.
4. `/api/user` reads Supabase first, then falls back to Prisma.

This prevents users from unlocking premium by editing browser localStorage.
