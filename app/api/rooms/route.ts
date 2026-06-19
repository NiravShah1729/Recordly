import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const rooms = await prisma.room.findMany({
    where: { hostId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { recordings: true },
      },
    },
  });

  return NextResponse.json(rooms);
}