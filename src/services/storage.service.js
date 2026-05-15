const {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { s3Client, BUCKET } = require("../config/s3");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const isS3Enabled = () =>
  process.env.S3_STORAGE === "true" &&
  !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET_NAME
  );

/**
 * Upload a file to S3 (or local disk when S3 is not configured).
 * Returns { key, url, storage, originalName, size, mimeType }
 */
async function uploadFile({
  buffer,
  originalName,
  mimeType,
  folder = "uploads",
  userId = null,
}) {
  const ext = path.extname(originalName) || "";
  const uniqueName = crypto.randomBytes(16).toString("hex") + ext;
  const key = `${folder}/${userId || "anon"}/${uniqueName}`;

  if (!isS3Enabled()) {
    // Fallback: save to local disk (preserves existing behaviour in dev)
    const localDir = path.join(__dirname, "../../uploads", folder);
    fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, uniqueName);
    fs.writeFileSync(localPath, buffer);
    return {
      key,
      url: `/uploads/${folder}/${uniqueName}`,
      storage: "local",
      originalName,
      size: buffer.length,
      mimeType,
    };
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: {
        originalName: encodeURIComponent(originalName),
        uploadedBy: userId || "anon",
      },
    }),
  );

  const url = process.env.S3_PUBLIC_URL
    ? `${process.env.S3_PUBLIC_URL}/${key}`
    : `https://${BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;

  return {
    key,
    url,
    storage: "s3",
    originalName,
    size: buffer.length,
    mimeType,
  };
}

/** Delete a file from S3 or local disk. */
async function deleteFile(key) {
  if (!isS3Enabled()) {
    const parts = key.split("/");
    const folder = parts[0];
    const filename = parts[parts.length - 1];
    const localPath = path.join(__dirname, "../../uploads", folder, filename);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    return;
  }
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Generate a pre-signed download URL for private S3 objects. */
async function getPresignedUrl(key, expiresIn = 3600) {
  if (!isS3Enabled()) return `/uploads/${key}`;
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn },
  );
}

module.exports = { uploadFile, deleteFile, getPresignedUrl, isS3Enabled };
