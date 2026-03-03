const express = require('express');
const router = express.Router();
const {authenticate} = require('../middlewares/auth.middleware');
const {postTestimonial,getAllTestimonials,editTestimonial} =require('../controller/testimonials.controller');



router.get('/',getAllTestimonials);
router.post('/', authenticate, postTestimonial);
router.put('/:testimonialId', authenticate, editTestimonial);

module.exports = router;


