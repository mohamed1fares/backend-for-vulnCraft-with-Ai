const Testimonial = require('../model/testimonials.model');
const logger = require('../utils/logger.utils');


exports.postTestimonial = async (req, res) => {
    try {
        const { comment, rate } = req.body;
        const userId = req.user._id;
        const newTestimonial = new Testimonial({ comment, rate, commenter: userId });
        const savedTestimonial = await newTestimonial.save();
        logger.info(`Post Testimonial successfully: ${comment}`);
        res.status(201).json(savedTestimonial);
    } catch (error) {
        logger.warn(`Post Testimonial Error: ${error.message}`);
        res.status(500).json({ message: 'Post Testimonial Error', error: error.message });
    }
};


exports.editTestimonial = async (req , res)=>{
    try{
        const { testimonialId } = req.params;
        const { comment, rate ,isdeleted } = req.body;
        const testimonial = await Testimonial.findByIdAndUpdate(
            testimonialId,
            { comment, rate, isdeleted },
            { new: true }
        );
        if (!testimonial) {
            return res.status(404).json({ message: 'Testimonial not found' });
        }
        logger.info(`Edit Testimonial successfully: ${testimonialId}`);
        res.status(200).json(testimonial);
    } catch (error) {
        logger.warn(`Edit Testimonial Error: ${error.message}`);
        res.status(500).json({ message: 'Edit Testimonial Error', error: error.message });
    }

}


exports.getAllTestimonials = async (req, res) => {
    try {
        const testimonials = await Testimonial.find().populate('commenter', 'fristName lastName email');
        res.status(200).json(testimonials);
    } catch (error) {
        res.status(500).json({ message: 'Get All Testimonials Error', error: error.message });
    }
};




