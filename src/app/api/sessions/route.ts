import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const sessionSchema = z.object({
  date: z.string(),
  status: z.enum(["complete", "partial", "missed"]),
  cyclesCompleted: z.number().int().min(0),
  totalCycles: z.number().int().min(0),
  elapsed: z.number().int().min(0),
  trainingDay: z.number().int().min(1),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await db.breathSession.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const record = await db.breathSession.create({
    data: { userId: session.user.id, ...parsed.data },
  });

  return NextResponse.json({ ok: true, id: record.id });
}
