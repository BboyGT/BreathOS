import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.userProfile.findUnique({ where: { userId: session.user.id } });
  const bpLogs = await db.bpLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  const breathSessions = await db.breathSession.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ profile, bpLogs, breathSessions });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { profile, bpLogs, breathSessions } = body;

  if (profile) {
    await db.userProfile.upsert({
      where: { userId: session.user.id },
      update: { ...profile },
      create: { userId: session.user.id, ...profile },
    });
  }

  if (Array.isArray(bpLogs)) {
    await db.bpLog.deleteMany({ where: { userId: session.user.id } });
    if (bpLogs.length > 0) {
      await db.bpLog.createMany({
        data: bpLogs.map((l: { date: string; systolic: number; diastolic: number; day: number }) => ({
          userId: session.user.id,
          date: l.date,
          systolic: l.systolic,
          diastolic: l.diastolic,
          day: l.day,
        })),
      });
    }
  }

  if (Array.isArray(breathSessions)) {
    await db.breathSession.deleteMany({ where: { userId: session.user.id } });
    if (breathSessions.length > 0) {
      await db.breathSession.createMany({
        data: breathSessions.map((s: {
          date: string;
          status: string;
          cyclesCompleted: number;
          totalCycles: number;
          elapsed: number;
          trainingDay: number;
        }) => ({
          userId: session.user.id,
          date: s.date,
          status: s.status,
          cyclesCompleted: s.cyclesCompleted,
          totalCycles: s.totalCycles,
          elapsed: s.elapsed,
          trainingDay: s.trainingDay,
        })),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
