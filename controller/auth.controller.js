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
// exports.resetPassword = async (req, res) => {
//     try {
//         const { email, otp, newPassword } = req.body;
//         const user = await User.findOne({ email });

//         if (!user) return res.status(404).json({ message: "User not found" });
//         if (user.otp !== otp) return res.status(400).json({ message: "Invalid code" });
//         if (user.otpExpires < Date.now()) return res.status(400).json({ message: "Code expired" });
//         if (user.otp ==otp)return res.status(200).json({ message: "Code verified. You can now reset your password." });
//         user.password = newPassword; // Hashing happens in model pre-save
//         user.otp = undefined;
//         user.otpExpires = undefined;
//         await user.save();

//         res.status(200).json({ message: "Password reset successfully" });
//     } catch (error) {
//         res.status(500).json({ message: "Error resetting password", error: error.message });
//     }
// };


// --- 6. Reset Password ---
exports.resetPassword = async (req, res) => {
    try {
        const { newPassword, resetToken } = req.body; 

        if (!resetToken) return res.status(401).json({ message: "No reset token provided" });

        // 1. فك تشفير التوكن والتحقق منه
        let decoded;
        try {
            decoded = jwt.verify(resetToken, process.env.JWT_KEY);
        } catch (err) {
            return res.status(401).json({ message: "Invalid or expired token. Please verify OTP again." });
        }

        // 2. الوصول لليوزر باستخدام الـ ID اللي جوه التوكن
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // 3. تحديث الباسورد ومسح بيانات الـ OTP
        user.password = newPassword;
        user.otp = undefined;
        user.otpExpires = undefined;
        
        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error resetting password", error: error.message });
    }
};


// --- 7. Verify OTP ---
exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: "User not found" });

        // التأكد من الكود وصلاحيته
        if (user.otp !== otp) return res.status(400).json({ message: "Invalid code" });
        if (user.otpExpires < Date.now()) return res.status(400).json({ message: "Code expired" });

        // --- التعديل هنا: إنتاج توكن مؤقت لمدة 5 دقائق ---
        const resetToken = jwt.sign(
            { id: user._id }, 
            process.env.JWT_KEY, // بنستخدم نفس المفتاح اللي عندك في signtoken
            { expiresIn: '5m' } 
        );

        res.status(200).json({ 
            message: "OTP verified. Proceed to reset password.",
            resetToken: resetToken // التوكن ده Angular هياخده
        });
        
    } catch (error) {
        res.status(500).json({ message: "Error verifying OTP", error: error.message });
    }
};