import { db } from "@/lib/db";

export interface SubscriptionRecord {
  app_user_id: string;
  email: string | null;
  subscription_tier: string;
  subscription_expiry: string | null;
  paystack_ref: string | null;
  paystack_customer_id: string | null;
}

interface UpsertSubscriptionInput {
  userId: string;
  email?: string | null;
  tier: string;
  expiry: string;
  paystackRef?: string | null;
  paystackCustomerId?: string | null;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseConfig());
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}) {
  const config = getSupabaseConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${message}`);
  }

  if (response.status === 204) return null;
  return response.json() as Promise<T>;
}

export async function getSupabaseSubscription(userId: string) {
  const rows = await supabaseRequest<SubscriptionRecord[]>(
    `breatheos_subscriptions?app_user_id=eq.${encodeURIComponent(userId)}&select=*`
  );
  return rows?.[0] ?? null;
}

export async function upsertSupabaseSubscription(input: UpsertSubscriptionInput) {
  const rows = await supabaseRequest<SubscriptionRecord[]>("breatheos_subscriptions?on_conflict=app_user_id", {
    method: "POST",
    body: JSON.stringify({
      app_user_id: input.userId,
      email: input.email ?? null,
      subscription_tier: input.tier,
      subscription_expiry: input.expiry,
      paystack_ref: input.paystackRef ?? null,
      paystack_customer_id: input.paystackCustomerId ?? null,
      updated_at: new Date().toISOString(),
    }),
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
  });
  return rows?.[0] ?? null;
}

export async function getAuthoritativeSubscription(userId: string) {
  const supabaseRecord = await getSupabaseSubscription(userId).catch(error => {
    console.error(error);
    return null;
  });

  if (supabaseRecord) {
    return {
      subscriptionTier: supabaseRecord.subscription_tier || "free",
      subscriptionExpiry: supabaseRecord.subscription_expiry || "",
      paystackRef: supabaseRecord.paystack_ref || "",
      paystackCustomerId: supabaseRecord.paystack_customer_id || "",
      source: "supabase" as const,
    };
  }

  const profile = await db.userProfile.findUnique({ where: { userId } });
  return {
    subscriptionTier: profile?.subscriptionTier || "free",
    subscriptionExpiry: profile?.subscriptionExpiry || "",
    paystackRef: profile?.paystackRef || "",
    paystackCustomerId: profile?.paystackCustomerId || "",
    source: "local" as const,
  };
}

export async function persistVerifiedSubscription(input: UpsertSubscriptionInput) {
  const supabaseRecord = await upsertSupabaseSubscription(input).catch(error => {
    console.error(error);
    return null;
  });

  await db.userProfile.upsert({
    where: { userId: input.userId },
    update: {
      subscriptionTier: input.tier,
      subscriptionExpiry: input.expiry,
      paystackRef: input.paystackRef ?? "",
      paystackCustomerId: input.paystackCustomerId ?? "",
    },
    create: {
      userId: input.userId,
      subscriptionTier: input.tier,
      subscriptionExpiry: input.expiry,
      paystackRef: input.paystackRef ?? "",
      paystackCustomerId: input.paystackCustomerId ?? "",
    },
  });

  return supabaseRecord;
}
