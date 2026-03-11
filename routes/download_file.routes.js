const express = require('express');
const router = express.Router();
const {authenticate} = require('../middlewares/auth.middleware');
const {authorize} = require('../middlewares/role.middelware');
const {downloadFile} = require('../controller/download_file.controller');


router.get('/',authenticate, downloadFile);

module.exports = router;