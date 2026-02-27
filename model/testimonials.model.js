const mongoose = require('mongoose');
const { isReadable } = require('nodemailer/lib/xoauth2');

const testimonials_Schema = new mongoose.Schema({
    commenter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    comment: { type: String, required: true },
    date :{type: Date , default: Date.now()},
    rate:{type: Number, min: 1, max: 5},
    top_comment:{type: Boolean,default:false},
    isdeleted:{type:Boolean,default:false}

}, { collection: 'testimonials' }); // نفس الاسم اللي في logger.utils

module.exports = mongoose.model('Testimonial', testimonials_Schema);