const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db.config');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger.utils');
const adminAccountMiddleware = require('./middlewares/createAdminAccount.middelware');

dotenv.config();

const app = express();


app.use(express.json());


app.use(cors());


const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));


app.use('/api/users', require('./routes/user.routes'));
app.use('/api/urls', require('./routes/url.routes'));
app.use('/api/vuln', require('./routes/vuln.routes'));
app.use('/api/logs', require('./routes/log.routes'));
app.use('/api/testimonials',require('./routes/testimonials.routes'))
app.use('/api/achievements',require('./routes/Achievement.routes'))
app.use('/api/demovideo',require('./routes/demovideo.routes'))
app.use('/api/download',require('./routes/download_file.routes'))

<<<<<<< Updated upstream
// basic error handler (so multer/file errors return nice message)  
=======

app.use('/api/results', require('./routes/results.routes')); 




>>>>>>> Stashed changes
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});


const PORT = process.env.PORT || 3000;


const AppError = require('./utils/app.error-utils');
const golbalErrorHandler = require('./middlewares/error-handelar.middelware');

app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(golbalErrorHandler);


(async () => {
  try {
    await connectDB(); 
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      if(logger) logger.info(`Server is running on port ${PORT}`);
    });
    adminAccountMiddleware.createAdminAccount();
  } catch (err) {
    console.error('Failed to connect DB, server not started:', err);
    process.exit(1);
  }
})();