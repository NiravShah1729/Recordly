import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { name, description } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "Room name is required" }, { status: 400 });
  }

  const room = await prisma.room.create({
    data: {
      name,
      description,
      hostId: user.id,
    },
  });

  return NextResponse.json({ success: true, room });
}
