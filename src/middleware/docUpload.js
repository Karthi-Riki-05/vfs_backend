// Shared multer instance for AI document-ingest endpoints.
// Enforces 10 MB size limit + MIME whitelist (PDF, DOC, DOCX, plain text).
// Surfaces multer errors in the project's { success, error: { code, message } } shape.

const multer = require("multer");

const ALLOWED_DOC_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIMES.includes(file.mimetype)) return cb(null, true);
    const err = new Error(
      `File type ${file.mimetype} is not allowed. Allowed: PDF, DOC, DOCX, TXT.`,
    );
    err.code = "INVALID_FILE_TYPE";
    cb(err, false);
  },
});

module.exports = { docUpload, ALLOWED_DOC_MIMES };
