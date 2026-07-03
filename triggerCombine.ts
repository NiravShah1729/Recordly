import 'dotenv/config';
import prisma from './lib/prisma';
import { combineRecordings } from './lib/combineRecordings';

async function main() {
  const roomId = process.argv[2];
  if (!roomId) {
    console.error("Usage: npx tsx triggerCombine.ts <roomId>");
    process.exit(1);
  }

  console.log(`Resetting combine status for room: ${roomId}`);
  
  try {
    await prisma.room.update({
      where: { id: roomId },
      data: { combineStatus: 'PENDING' } // Ensure it bypasses the skip check
    });
    console.log("Status reset to PENDING.");
  } catch (err) {
    console.error("Error resetting status (room might not exist):", err);
    process.exit(1);
  }

  console.log(`Triggering combine for room ${roomId}...`);
  await combineRecordings(roomId);
  console.log("Finished running combine function.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
