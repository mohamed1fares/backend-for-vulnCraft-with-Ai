// const User = require('../model/user.model.js');
// const jwt = require('jsonwebtoken');
// const logger = require('../utils/logger.utils');
// const sendEmail = require('../utils/email.utils');
// const crypto = require('crypto'); // Built-in node module

// const signtoken = (user) => {
//     return jwt.sign({ id: user._id, role: user.role, name: user.fristName }, process.env.JWT_KEY, { expiresIn: process.env.JWT_EXPIRES_IN });
// }

// // --- دالة مساعدة لتوليد كود عشوائي ---
// const generateOTP = () => {
//     // يولد رقم من 6 خانات
//     return Math.floor(100000 + Math.random() * 900000).toString();
// };

// // --- 1. Sign Up (Register) ---
// exports.signup = async (req, res) => {
//     try {
//         const { fristName, lastName, email, password, location, phone, age, nationalID } = req.body;
        
//         // التحقق من وجود المستخدم
//         const existingUser = await User.findOne({ email });
//         if (existingUser) {
//             return res.status(400).json({ message: "Email already exists" });
//         }

//         // توليد الـ OTP
//         const otpCode = generateOTP();
//         const otpExpires = Date.now() + 10 * 60 * 1000; // صلاحية 10 دقائق

//         // الصورة (اختياري حسب الميدل وير بتاعك)
//         const image = req.file ? req.file.filename : 'default.jpg';

//         const newUser = await User.create({
//             fristName,
//             lastName,
//             email,
//             password,
//             location,
//             phone,
//             age,
//             nationalID,
//             image,
//             role: 'user',       // افتراضي
//             isVerified: false,  // 🔥 غير مفعل
//             otp: otpCode,       // 🔥 تخزين الكود
//             otpExpires: otpExpires
//         });

//         // إرسال الإيميل
//         const message = `Your verification code is ${otpCode}`;
//         await sendEmail({
//             email: newUser.email,
//             subject: '🔐 Verify Your Account - VlunCraft',
//             message: message,
//             html: `
//                 <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
//                     <h2 style="color: #4c6ef5;">Welcome to VlunCraft!</h2>
//                     <p>Please verify your account using the code below:</p>
//                     <h1 style="background: #eee; padding: 10px; display: inline-block; letter-spacing: 5px; color: #333;">${otpCode}</h1>
//                     <p>This code expires in 10 minutes.</p>
//                 </div>
//             `
//         });

//         logger.info(`New user registered (pending verification): ${email}`);
        
//         res.status(201).json({ 
//             message: "User registered successfully. Please check your email for OTP.",
//             email: newUser.email 
//         });

//     } catch (error) {
//         logger.error(`Signup Error: ${error.message}`);
//         res.status(500).json({ message: "Error creating user", error: error.message });
//     }
// };

// // --- 2. Verify Account ---
// exports.verifyAccount = async (req, res) => {
//     try {
//         const { email, otp } = req.body;

//         const user = await User.findOne({ email });

//         if (!user) {
//             return res.status(404).json({ message: "User not found" });
//         }

//         if (user.isVerified) {
//             return res.status(400).json({ message: "User already verified" });
//         }

//         // التحقق من صحة الكود ووقته
//         if (user.otp !== otp) {
//             return res.status(400).json({ message: "Invalid OTP code" });
//         }

//         if (user.otpExpires < Date.now()) {
//             return res.status(400).json({ message: "OTP expired. Please request a new one." });
//         }

//         // تفعيل الحساب ومسح الكود
//         user.isVerified = true;
//         user.otp = undefined;
//         user.otpExpires = undefined;
//         await user.save();

//         logger.info(`User verified successfully: ${email}`);
        
//         // نرجع توكن عشان يدخل على طول
//         const token = signtoken(user);
//         res.status(200).json({ message: "Account verified successfully", token });

//     } catch (error) {
//         res.status(500).json({ message: "Verification failed", error: error.message });
//     }
// };

// // --- 3. Login (تعديل) ---
// exports.login = async (req, res) => {
//     try {
//         const { email, password } = req.body;
//         const user = await User.findOne({ email: email });

//         if (!user || !(await user.correctPassword(password))) {
//             return res.status(401).json({ message: "User email or password is incorrect" });
//         }

//         // 🔥 التحقق من التفعيل قبل السماح بالدخول
//         if (!user.isVerified) {
//             return res.status(403).json({ 
//                 message: "Account not verified. Please verify your email.",
//                 notVerified: true // علامة للفرونت عشان يوجهه لصفحة الـ OTP
//             });
//         }

//         logger.info(`User login successfully: ${email}`);
//         res.status(200).json({ message: "User logged in successfully", token: signtoken(user) });

//     } catch (error) {
//         res.status(500).json({ message: "Login error", error: error.message });
//     }
// };

// // --- 4. Resend OTP (اختياري) ---
// exports.resendOTP = async (req, res) => {
//     try {
//         const { email } = req.body;
//         const user = await User.findOne({ email });

//         if (!user) return res.status(404).json({ message: "User not found" });
//         if (user.isVerified) return res.status(400).json({ message: "Account already verified" });

//         const otpCode = generateOTP();
//         user.otp = otpCode;
//         user.otpExpires = Date.now() + 10 * 60 * 1000;
//         await user.save();

//         await sendEmail({
//             email: user.email,
//             subject: '🔐 New Verification Code',
//             message: `Your new code is ${otpCode}`,
//             html: `
//                 <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
//                     <p>You requested a new verification code:</p>
//                     <h1 style="background: #eee; padding: 10px; display: inline-block; letter-spacing: 5px;">${otpCode}</h1>
//                 </div>
//             `
//         });

//         res.status(200).json({ message: "New OTP sent successfully" });

//     } catch (error) {
//         res.status(500).json({ message: "Error sending OTP", error: error.message });
//     }


//     // --- 5. Forgot Password (طلب استعادة كلمة المرور) ---
// exports.forgotPassword = async (req, res) => {
//     try {
//         const { email } = req.body;
//         const user = await User.findOne({ email });

//         if (!user) {
//             return res.status(404).json({ message: "User not found with this email" });
//         }

//         // توليد كود OTP جديد
//         const otpCode = generateOTP();
//         user.otp = otpCode;
//         user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 دقائق
//         await user.save();

//         // إرسال الإيميل
//         await sendEmail({
//             email: user.email,
//             subject: '🔑 Reset Your Password - VlunCraft',
//             message: `Your reset code is ${otpCode}`,
//             html: `
//                 <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center; border: 1px solid #eee; border-radius: 10px;">
//                     <h2 style="color: #ff003c;">Password Reset Request</h2>
//                     <p>You requested to reset your password. Use the code below to proceed:</p>
//                     <h1 style="background: #eee; padding: 10px; display: inline-block; letter-spacing: 5px; color: #333; border-radius: 5px;">${otpCode}</h1>
//                     <p>This code expires in 10 minutes.</p>
//                     <p style="font-size: 12px; color: #777;">If you didn't request this, please ignore this email.</p>
//                 </div>
//             `
//         });

//         res.status(200).json({ message: "Reset code sent to your email" });

//     } catch (error) {
//         res.status(500).json({ message: "Error sending reset code", error: error.message });
//     }
// };

// // --- 6. Reset Password (تعيين كلمة المرور الجديدة) ---
// exports.resetPassword = async (req, res) => {
//     try {
//         const { email, otp, newPassword } = req.body;

//         const user = await User.findOne({ email });

//         if (!user) {
//             return res.status(404).json({ message: "User not found" });
//         }

//         // التحقق من صحة الكود والوقت
//         if (user.otp !== otp) {
//             return res.status(400).json({ message: "Invalid verification code" });
//         }

//         if (user.otpExpires < Date.now()) {
//             return res.status(400).json({ message: "Code expired. Please request a new one." });
//         }

//         // تحديث كلمة المرور
//         user.password = newPassword; // الـ pre-save hook هيعمل الـ hashing
        
//         // تنظيف الـ OTP
//         user.otp = undefined;
//         user.otpExpires = undefined;
        
//         await user.save();

//         res.status(200).json({ message: "Password reset successfully. You can now login." });

//     } catch (error) {
//         res.status(500).json({ message: "Error resetting password", error: error.message });
//     }
// };
// };


const User = require('../model/user.model.js');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger.utils');
const sendEmail = require('../utils/email.utils');

// --- Helper Functions ---
const signtoken = (user) => {
    return jwt.sign({ id: user._id, role: user.role, name: user.fristName }, process.env.JWT_KEY, { expiresIn: process.env.JWT_EXPIRES_IN });
}

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// --- 1. Sign Up ---
exports.signup = async (req, res) => {
    try {
        const { fristName, lastName, email, password, location, phone, age, nationalID } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const otpCode = generateOTP();
        const otpExpires = Date.now() + 10 * 60 * 1000; 
        const image = req.file ? req.file.filename : 'default.jpg';

        const newUser = await User.create({
            fristName, lastName, email, password, location, phone, age, nationalID, image,
            role: 'user',
            isVerified: false,
            otp: otpCode,
            otpExpires: otpExpires
        });

        await sendEmail({
            email: newUser.email,
            subject: '🔐 Verify Your Account - VlunCraft',
            message: `Your code: ${otpCode}`,
            html: `<div style="padding: 20px; text-align: center;"><h2>Welcome!</h2><p>Your verification code:</p><h1>${otpCode}</h1></div>`
        });

        logger.info(`New user registered: ${email}`);
        res.status(201).json({ message: "User registered. Check email for OTP.", email: newUser.email });

    } catch (error) {
        logger.error(`Signup Error: ${error.message}`);
        res.status(500).json({ message: "Error creating user", error: error.message });
    }
};

// --- 2. Login ---
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email });

        if (!user || !(await user.correctPassword(password))) {
            return res.status(401).json({ message: "User email or password is incorrect" });
        }

        if (!user.isVerified) {
            return res.status(403).json({ message: "Account not verified", notVerified: true });
        }

        logger.info(`User login: ${email}`);
        res.status(200).json({ message: "User logged in successfully", token: signtoken(user) });

    } catch (error) {
        res.status(500).json({ message: "Login error", error: error.message });
    }
};

// --- 3. Verify Account ---
exports.verifyAccount = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.isVerified) return res.status(400).json({ message: "User already verified" });
        if (user.otp !== otp) return res.status(400).json({ message: "Invalid OTP code" });
        if (user.otpExpires < Date.now()) return res.status(400).json({ message: "OTP expired" });

        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.status(200).json({ message: "Account verified successfully", token: signtoken(user) });

    } catch (error) {
        res.status(500).json({ message: "Verification failed", error: error.message });
    }
};

// --- 4. Resend OTP ---
exports.resendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.isVerified) return res.status(400).json({ message: "Account already verified" });

        const otpCode = generateOTP();
        user.otp = otpCode;
        user.otpExpires = Date.now() + 10 * 60 * 1000;
        await user.save();

        await sendEmail({
            email: user.email,
            subject: '🔐 New Code',
            message: `Code: ${otpCode}`,
            html: `<h1>${otpCode}</h1>`
        });

        res.status(200).json({ message: "New OTP sent" });
    } catch (error) {
        res.status(500).json({ message: "Error sending OTP", error: error.message });
    }
};

// --- 5. Forgot Password (🔥🔥🔥 الدوال التي كانت ناقصة) ---
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) return res.status(404).json({ message: "User not found" });

        const otpCode = generateOTP();
        user.otp = otpCode;
        user.otpExpires = Date.now() + 10 * 60 * 1000;
        await user.save();

        await sendEmail({
            email: user.email,
            subject: '🔑 Reset Password Code',
            message: `Code: ${otpCode}`,
            html: `<div style="text-align:center"><h2>Reset Password</h2><h1>${otpCode}</h1></div>`
        });
        console.log(`Reset code for ${email}: ${otpCode}`); // للتطوير فقط، احذر من تركه في الإنتاج
        res.status(200).json({ message: "Reset code sent" });
    } catch (error) {
        res.status(500).json({ message: "Error sending reset code", error: error.message });
    }
};

// --- 6. Reset Password ---
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.otp !== otp) return res.status(400).json({ message: "Invalid code" });
        if (user.otpExpires < Date.now()) return res.status(400).json({ message: "Code expired" });

        user.password = newPassword; // Hashing happens in model pre-save
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error resetting password", error: error.message });
    }
};