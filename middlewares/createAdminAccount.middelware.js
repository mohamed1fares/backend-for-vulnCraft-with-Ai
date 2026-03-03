const User = require("../model/user.model");
const License = require("../model/license.model");
const logger = require('../utils/logger.utils');


exports.createAdminAccount = async () => {
    try {
        const existingAdmin = await User.findOne({ role: 'admin' });

        if (existingAdmin) {
            // console.log("ℹ️ Admin account already exists.");
            return;
        }

        const defaultLicense = await License.findOne(); 
        
        // if (!defaultLicense) {
        //     console.error("❌ No License found. Please create at least one license first.");
        //     return;
        // }

        const adminData = {
            fristName: "Super",
            lastName: "Admin",
            email: process.env.ADMIN_EMAIL || 'admin@gmail.com',
            password: process.env.ADMIN_PASSWORD || 'Mohamed2026',
            location: "System",
            phone: "0123456789",
            age: 30,
            nationalID: 12345678901234,
            image: "default-admin.png",
            role: 'admin',
            // license: defaultLicense._id, 
            userActive: 'active',
            userPending: 'accepted',
            isVerified: true
        };

        const newAdmin = new User(adminData);
        await newAdmin.save();

        logger.info(`✅ Admin account created: ${newAdmin.email}`);
        console.log(`✅ Admin account created: ${newAdmin.email}`);
        
    } catch (error) {
        logger.error(`❌ Error creating admin account: ${error.message}`);
        console.error(`❌ Error creating admin account: ${error.message}`);
    }
}