const { S3Client } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
  // MinIO / S3-compatible endpoint support
  ...(process.env.S3_ENDPOINT
    ? {
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: true,
      }
    : {}),
});

const BUCKET = process.env.S3_BUCKET_NAME || "valuecharts-uploads";

module.exports = { s3Client, BUCKET };


