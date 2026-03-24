import { writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file received" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const filename = `recording-${Date.now()}.webm`;
  const filepath = path.join(process.cwd(), "public", "recordings", filename);

  await writeFile(filepath, buffer);

  return NextResponse.json({ success: true, filename });
}