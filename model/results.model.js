const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    url: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Url',
        required: true
    },
    scanDate: {
        type: Date,
        default: Date.now
    },
    // ملخص سريع للتقرير
    summary: {
        totalVulnerabilities: { type: Number, default: 0 },
        highestSeverity: { 
            type: String, 
            enum: ['safe', 'Low', 'Medium', 'High', 'Critical'],
            default: 'safe'
        }
    },
    // مصفوفة تحتوي على تفاصيل كل ثغرة تم فحصها
    details: [
        {
            vulnerabilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vulnerability' },
            vulnerabilityName: String, // تخزين الاسم لتسهيل العرض
            severity: String,
            isDetected: Boolean, // هل الثغرة موجودة أم لا
            technicalDetail: Object // هنا نخزن مخرجات البايثون (اختياري)
        }
    ],
    // محتوى التقرير المولد من الذكاء الاصطناعي
    aiReportContent: {
        type: String,
        default: null
    },
    // اسم ملف الـ PDF المحفوظ
    pdfFilename: {
        type: String,
        default: null
    },
    // بيانات التقرير الإضافية (ميتا داتا)
    reportMeta: {
        referenceId: String,
        version: Number,
        classification: String,
        securityPosture: Object,
        totalFindings: Number,
        severityDistribution: Object
    }
}, { timestamps: true });


module.exports = mongoose.model('Report', reportSchema);