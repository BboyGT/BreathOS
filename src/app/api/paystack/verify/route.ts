import { NextResponse } from "next/server";
import { persistVerifiedSubscription } from "@/lib/supabase-subscriptions";
import { hasUsablePaystackSecret } from "../config";
import { getPaystackPlan } from "../plans";

export async function GET(req: Request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!hasUsablePaystackSecret(secretKey)) {
    return NextResponse.json({ error: "Paystack secret key is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "Payment reference is required." }, { status: 400 });

  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await response.json();
  if (!response.ok || !data.status) {
    return NextResponse.json({ error: data.message || "Paystack verification failed." }, { status: 502 });
  }

  const transaction = data.data;
  const packageId = transaction.metadata?.packageId;
  const appUserId = transaction.metadata?.appUserId;
  const plan = getPaystackPlan(packageId);

  if (!plan) return NextResponse.json({ error: "Payment package metadata is invalid." }, { status: 400 });
  if (!appUserId) return NextResponse.json({ error: "Payment is missing the app account metadata." }, { status: 400 });
  if (transaction.status !== "success") {
    return NextResponse.json({ status: transaction.status, packageId: plan.id }, { status: 402 });
  }
  if (transaction.amount < plan.amountKobo) {
    return NextResponse.json({ error: "Payment amount does not match the selected package." }, { status: 400 });
  }

  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 1);
  const subscriptionExpiry = expiry.toISOString();

  await persistVerifiedSubscription({
    userId: appUserId,
    email: transaction.customer?.email || transaction.metadata?.appUserEmail || null,
    tier: plan.id,
    expiry: subscriptionExpiry,
    paystackRef: transaction.reference,
    paystackCustomerId: transaction.customer?.customer_code || null,
  });

  return NextResponse.json({
    status: "success",
    packageId: plan.id,
    reference: transaction.reference,
    subscriptionExpiry,
  });
}
