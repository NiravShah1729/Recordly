-- DropForeignKey
ALTER TABLE "Recording" DROP CONSTRAINT "Recording_roomId_fkey";

-- AlterTable
ALTER TABLE "Recording" ALTER COLUMN "roomId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
