const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
totalScan:{type:Number,default:0},
totalVuln:{type:Number,default:0},
totalClientSatisfaction:{type:Number,default:0},

}, { collection: 'achievements' }); 

module.exports = mongoose.model('Achievement', achievementSchema);