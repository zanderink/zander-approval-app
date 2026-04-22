const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'zander-secret',
  resave: false,
  saveUninitialized: true
}));

// Upload setup
const upload = multer({ dest: 'public/uploads/' });

// Simple file DB
const DATA_FILE = 'jobs.json';

function getJobs() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveJobs(jobs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

// Email setup (leave blank for now if needed)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// LOGIN
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  if (
    req.body.username === process.env.ADMIN_USERNAME &&
    req.body.password === process.env.ADMIN_PASSWORD
  ) {
    req.session.loggedIn = true;
    return res.redirect('/');
  }
  res.send('Login failed');
});

// AUTH MIDDLEWARE
function requireLogin(req, res, next) {
  if (!req.session.loggedIn) return res.redirect('/login');
  next();
}

// DASHBOARD
app.get('/', requireLogin, (req, res) => {
  const jobs = getJobs();
  res.render('dashboard', { jobs });
});

// NEW JOB PAGE
app.get('/jobs/new', requireLogin, (req, res) => {
  res.render('new-job');
});

// CREATE JOB
app.post('/jobs', requireLogin, upload.single('mockup'), (req, res) => {
  const jobs = getJobs();

  const job = {
    id: uuidv4(),
    ...req.body,
    mockup: req.file ? `/public/uploads/${req.file.filename}` : null,
    status: 'pending'
  };

  jobs.push(job);
  saveJobs(jobs);

  res.redirect('/');
});

// JOB DETAIL
app.get('/jobs/:id', requireLogin, (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.send('Not found');

  res.render('job-detail', { job });
});

// SEND APPROVAL (FIXED)
app.post('/jobs/:id/send-approval', requireLogin, async (req, res) => {
  try {
    const jobs = getJobs();
    const job = jobs.find(j => j.id === req.params.id);
    if (!job) return res.status(404).send('Job not found');

    if (!job.customer_email || !job.customer_email.includes('@')) {
      return res.status(400).send('Customer email missing or invalid');
    }

    const approvalLink = `${process.env.BASE_URL}/approve/${job.id}`;

    const html = `
      <h2>${process.env.SHOP_NAME || 'Zander Ink'} Mockup Approval</h2>
      <p>Please review your mockup below.</p>
      ${job.mockup ? `<p><img src="${process.env.BASE_URL}${job.mockup}" style="max-width:400px;"></p>` : ''}
      <p><strong>Customer:</strong> ${job.customer_name || '-'}</p>
      <p><strong>Garment:</strong> ${job.garment || '-'}</p>
      <p><strong>Garment Color:</strong> ${job.garment_color || '-'}</p>
      <p><strong>Print Locations:</strong> ${job.print_locations || '-'}</p>
      <p><strong>Imprint Colors:</strong> ${job.imprint_colors || '-'}</p>
      <p><strong>Total Price:</strong> ${job.total_price || '-'}</p>
      <p><a href="${approvalLink}">Approve or Request Changes</a></p>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: job.customer_email,
      subject: `${process.env.SHOP_NAME || 'Zander Ink'} mockup approval`,
      html
    });

    job.status = 'Sent';
    saveJobs(jobs);

    return res.redirect(`/jobs/${job.id}`);
  } catch (err) {
    console.error('EMAIL SEND ERROR:', err);
    return res.status(500).send(`Email failed: ${err.message}`);
  }
});

// APPROVAL PAGE
app.get('/approve/:id', (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.send('Not found');

  res.render('customer-approval', { job });
});
app.post('/approve/:id', (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  const action = req.body.action;
  const customerNotes = req.body.customer_notes || '';

  if (action === 'approve') {
    job.approval_status = 'APPROVED';
    job.status = 'Ready for Production';
  } else {
    job.approval_status = 'REQUEST CHANGES';
    job.status = 'Changes Requested';
  }

  job.customer_notes = customerNotes;
  saveJobs(jobs);

  res.render('approval-result', { job });
});
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
