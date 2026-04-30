import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const bpSchema = z.object({
  date: z.string(),
  systolic: z.number().int().min(60).max(260),
  diastolic: z.number().int().min(30).max(160),
  day: z.number().int().min(1),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logs = await db.bpLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ bpLog: logs.map((l) => ({ date: l.date, s: l.systolic, d: l.diastolic, day: l.day })) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = bpSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const log = await db.bpLog.create({
    data: { userId: session.user.id, ...parsed.data },
  });

  return NextResponse.json({ ok: true, id: log.id });
}
