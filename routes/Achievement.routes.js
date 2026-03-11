const express = require('express');
const router = express.Router();
const {authenticate} = require('../middlewares/auth.middleware');
const {authorize} = require('../middlewares/role.middelware');
const {postAchievements,getAchievements}=require('../controller/Achievement.controller')


router.get('/',getAchievements);
router.post('/',authenticate,authorize('admin'),postAchievements);



module.exports = router;