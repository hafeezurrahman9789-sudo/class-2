require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

require('./db'); // ensures schema is created on boot

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/testpdfs', require('./routes/testpdfs'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/submissions', require('./routes/submissions'));
app.use('/api/semresults', require('./routes/semresults'));
app.use('/api/cgpa', require('./routes/cgpa'));
app.use('/api/practicals', require('./routes/practicals'));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api/admin', require('./routes/admin'));

// Multer / generic error handler for the API
app.use('/api', (err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message || 'Something went wrong.' });
});

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'client'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('manifest.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
    // Always let browsers re-check the service worker file so updates roll out promptly.
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`The Register is running at http://localhost:${PORT}`);
});
