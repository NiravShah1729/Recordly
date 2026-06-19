import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn("AWS credentials are not properly set in the environment variables!");
}

export const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Uploads a file buffer to the configured S3 bucket
 */
export async function uploadFileToS3(fileBuffer: Buffer, fileName: string, contentType: string) {
  if (!process.env.AWS_S3_BUCKET_NAME) {
    throw new Error("AWS_S3_BUCKET_NAME is not defined in the environment variables.");
  }

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
  });

  try {
    const response = await s3Client.send(command);
    return { success: true, response, fileName };
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw error;
  }
}
