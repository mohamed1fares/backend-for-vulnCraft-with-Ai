const DemoVideo = require('../model/demovideo.model'); // تأكد من اسم الملف
const logger = require('../utils/logger.utils');
const fs = require('fs');
const path = require('path');


exports.getDemoVideo = async (req, res) => {
    try {
        const demoVideo = await DemoVideo.findOne();
        res.status(200).json(demoVideo);
    } catch (error) {
        logger.warn(`Get Demo Video Error: ${error.message}`);
        res.status(500).json({ message: 'Get Demo Video Error', error: error.message });
    }
}




exports.postDemoVideo = async (req, res) => {
    try {
        const { description } = req.body;
        let videoPath = null;

        // 1. معالجة مسار الفيديو بناءً على الـ Middleware بتاعك
        if (req.file) {
            // الميدل وير بتاعك بيخزن في مجلد videos
            const fullPath = req.file.path.replace(/\\/g, '/');
            const idx = fullPath.indexOf('/videos/'); // بنبحث عن videos مش uploads
            videoPath = idx !== -1 ? fullPath.slice(idx + 1) : `videos/${req.file.filename}`;
        }

        // 2. البحث عن الديمو القديم (باستخدام الحقل 'video' كما في الموديل)
        const oldDemo = await DemoVideo.findOne();

        // 3. تنظيف السيرفر من الفيديو القديم
        if (oldDemo && videoPath && oldDemo.video) {
            // بنطلع خطوة لورا عشان نوصل لمجلد الـ videos اللي برا الـ controllers
            const oldFilePath = path.join(__dirname, '..', oldDemo.video); 
            
            if (fs.existsSync(oldFilePath)) {
                try {
                    fs.unlinkSync(oldFilePath);
                    logger.info(`Old video deleted: ${oldDemo.video}`);
                } catch (err) {
                    logger.warn(`Could not delete old file: ${err.message}`);
                }
            }
        }

        // 4. تحديث أو إنشاء (Upsert logic)
        let result;
        if (oldDemo) {
            oldDemo.description = description || oldDemo.description;
            if (videoPath) oldDemo.video = videoPath; // تحديث حقل video
            result = await oldDemo.save();
        } else {
            result = await DemoVideo.create({
                description,
                video: videoPath // إنشاء بحقل video
            });
        }

        res.status(201).json({
            message: "Demo video updated successfully",
            data: result
        });

    } catch (error) {
        logger.warn(`Post Demo Video Error: ${error.message}`);
        res.status(500).json({ message: 'Error uploading video', error: error.message });
    }
};