const express = require('express');
const router = express.Router();
const videoUpload = require('../middlewares/uploads_video.middelware');
const demoController = require('../controller/demovideo.controller');
const {authenticate} = require('../middlewares/auth.middleware');
const {authorize} = require('../middlewares/role.middelware');

router.get('/', demoController.getDemoVideo);
router.post('/', authenticate, authorize('admin'), videoUpload.single('video'), demoController.postDemoVideo);

module.exports = router;