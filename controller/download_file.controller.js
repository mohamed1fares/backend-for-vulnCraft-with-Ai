const path = require('path');
const fs = require('fs');

exports.downloadFile = (req, res) => {
    const fileName = 'pdf.pdf'; 
    const filePath = path.join(__dirname, '../report', fileName);

    // تأكد إن الملف موجود فعلاً قبل ما تبدأ
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "الملف غير موجود على السيرفر" });
    }

    res.download(filePath, fileName, (err) => {
        if (err) {
            if (res.headersSent) {
                console.error("التحميل قطع بعد ما بدأ:", err.message);
                return; 
            }
            res.status(500).json({ message: "خطأ في السيرفر" });
        }
        // res.download بتقفل الـ response لوحدها، فمش محتاجين نكتب res.end()
    });
};