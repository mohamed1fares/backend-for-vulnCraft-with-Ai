const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({

license:{type: String, enum: ['free','Standard', 'premium','Enterprise','try','admin'], default: 'free' ,required:true},
popular :{type: String, enum: ['free','Standard', 'premium','Enterprise']},
smallDescription :{type:String,trim :true},
price:{type:Number,required:true},
features:{type:[String],required:true}


}, { collection: 'licenses' }); 

module.exports = mongoose.model('License', licenseSchema);