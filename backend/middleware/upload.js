import multer from "multer";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      const err = new Error("Only JPEG, PNG, WebP and GIF images are allowed");
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

export default upload;
