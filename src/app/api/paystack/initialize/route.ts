import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hasUsablePaystackSecret } from "../config";
import { getPaystackPlan } from "../plans";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before upgrading so the payment can be attached to your account." }, { status: 401 });
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!hasUsablePaystackSecret(secretKey)) {
    return NextResponse.json({ error: "Paystack secret key is not configured." }, { status: 500 });
  }

  const body = await req.json();
  const plan = getPaystackPlan(String(body.packageId || ""));
  const email = String(body.email || session.user.email || "").trim();
  const name = String(body.name || "").trim();

  if (!plan) return NextResponse.json({ error: "Unknown premium package." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3333";
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: plan.amountKobo,
      currency: "NGN",
      callback_url: appUrl,
      metadata: {
        packageId: plan.id,
        packageName: plan.name,
        customerName: name,
        appUserId: session.user.id,
        appUserEmail: session.user.email,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.status) {
    return NextResponse.json({ error: data.message || "Paystack initialization failed." }, { status: 502 });
  }

  return NextResponse.json({
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  });
}
