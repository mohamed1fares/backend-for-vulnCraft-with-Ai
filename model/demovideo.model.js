const mongoose = require('mongoose');

const demoVideoSchema = new mongoose.Schema({
    video: { type: String, required: true },
    description: { type: String, trim: true },
    uploadDate: { type: Date, default: Date.now }
}, { collection: 'demo_videos' }); 

module.exports = mongoose.model('DemoVideo', demoVideoSchema);