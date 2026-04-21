require('dotenv').config();
const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true
}));

const upload = multer({ dest: 'uploads/' });

const dataFile = path.join(__dirname, 'jobs.json');

function getJobs() {
  if (!fs.existsSync(dataFile)) return [];
  return JSON.parse(fs.readFileSync(dataFile));
}

function saveJobs(jobs) {
  fs.writeFileSync(dataFile, JSON.stringify(jobs, null, 2));
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  if (req.body.username === process.env.ADMIN_USERNAME &&
      req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.redirect('/');
  }
  res.send('Login failed');
});

app.get('/', (req, res) => {
  if (!req.session.loggedIn) return res.redirect('/login');
  const jobs = getJobs();
  res.render('dashboard', { jobs });
});

app.post('/create-job', upload.single('mockup'), (req, res) => {
  const jobs = getJobs();

  const job = {
    id: uuidv4(),
    ...req.body,
    mockup: req.file ? req.file.filename : null,
    status: 'pending'
  };

  jobs.push(job);
  saveJobs(jobs);

  res.redirect('/');
});

app.post('/send-approval/:id', async (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);

  const link = `${process.env.BASE_URL}/approve/${job.id}`;

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: job.email,
    subject: 'Approve your mockup',
    html: `<a href="${link}">Click to approve</a>`
  });

  res.redirect('/');
});

app.get('/approve/:id', (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  res.render('customer-approval', { job });
});

app.post('/approve/:id', (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);

  job.status = req.body.action === 'approve' ? 'approved' : 'changes';
  job.notes = req.body.notes;

  saveJobs(jobs);

  res.render('approval-result', { job });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
