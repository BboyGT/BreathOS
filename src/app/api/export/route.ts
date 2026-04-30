import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.userProfile.findUnique({ where: { userId: session.user.id } });
  const bpLogs = await db.bpLog.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } });
  const sessions = await db.breathSession.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } });

  const csvLines = ["date,systolic,diastolic,day"];
  for (const b of bpLogs) csvLines.push(`${b.date},${b.systolic},${b.diastolic},${b.day}`);

  const json = JSON.stringify({ profile, bpLogs, sessions }, null, 2);

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="breatheos-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
