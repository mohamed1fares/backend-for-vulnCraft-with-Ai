const Achievement = require('../model/Achievement.model');
const logger = require('../utils/logger.utils');



exports.getAchievements = async(req,res)=>{
    try{
        const achievements = await Achievement.findOne();
        res.status(200).json(achievements);
    }catch(error){
        logger.warn(`Get Achievements Error: ${error.message}`);
        res.status(500).json({message:'Get Achievements Error', error: error.message})
    }
}

exports.postAchievements = async (req,res)=>{
    try{
        const {totalClientSatisfaction,totalVuln,totalScan} = req.body;
        let achievement = await Achievement.findOne();
        if(!achievement){
            achievement = new Achievement({totalClientSatisfaction,totalVuln,totalScan});
        }else{
            achievement.totalClientSatisfaction = totalClientSatisfaction;
            achievement.totalVuln = totalVuln;
            achievement.totalScan = totalScan;
        }
        const savedAchievement = await achievement.save();
        logger.info(`Post Achievements successfully: ${savedAchievement}`);
        res.status(201).json(savedAchievement);
    }catch(error){
        logger.warn(`Post Achievements Error: ${error.message}`);
        res.status(500).json({message:'Post Achievements Error', error: error.message})
    }
}



