const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. تحديد مسار خاص بالفيديوهات
const videoDir = path.join(__dirname, '..', 'videos');

if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir, { recursive: true });
}

const fileFilter = (req, file, cb) => {
  // 2. التحقق من نوع الـ MIME والامتداد معاً لزيادة الأمان
  const allowedExtensions = ['.mp4', '.mkv', '.mov', '.avi', '.wmv'];
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.startsWith('video/');

  if (allowedExtensions.includes(ext) && mimeType) {
    cb(null, true);
  } else {
    cb(new Error('Format not supported! Please upload a valid video (MP4, MKV, MOV, AVI)'), false);
  }
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, videoDir);
  },
  filename: function (req, file, cb) {
    // إضافة Random number لمنع تكرار الأسماء في الملفات الكبيرة
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `video-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  }
});

// 3. إعدادات الحجم (مهمة جداً للفيديو)
const videoUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 ميجابايت كحد أقصى
  }
});

module.exports = videoUpload;