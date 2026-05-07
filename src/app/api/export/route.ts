import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const STUDIO_TIERS = new Set(["premium_studio", "premium_yearly", "premium_monthly"]);

function hasStudioExport(profile: { subscriptionTier?: string | null; subscriptionExpiry?: Date | string | null } | null) {
  if (!profile?.subscriptionTier || !STUDIO_TIERS.has(profile.subscriptionTier)) return false;
  if (!profile.subscriptionExpiry) return true;
  return new Date(profile.subscriptionExpiry) > new Date();
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const wantsAdvanced = url.searchParams.get("advanced") === "1";
  const profile = await db.userProfile.findUnique({ where: { userId: session.user.id } });
  const bpLogs = await db.bpLog.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } });
  const sessions = await db.breathSession.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } });

  const advancedAllowed = wantsAdvanced && hasStudioExport(profile);
  const basicProfile = profile ? {
    age: profile.age,
    gender: profile.gender,
    weight: profile.weight,
    systolic: profile.systolic,
    diastolic: profile.diastolic,
    goal: profile.goal,
    trainingDay: profile.trainingDay,
  } : null;
  const json = JSON.stringify(
    advancedAllowed
      ? { profile, bpLogs, sessions, exportType:"studio", exportedAt:new Date().toISOString() }
      : { profile:basicProfile, bpLogs, sessions, exportType:"basic", exportedAt:new Date().toISOString() },
    null,
    2
  );

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="breatheos-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
