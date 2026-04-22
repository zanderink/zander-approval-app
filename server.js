require('dotenv').config();

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
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});
});
 
// 👇 ADD THIS RIGHT HERE

pool.query(`
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  customer_name TEXT,
  company_name TEXT,
  customer_email TEXT,
  garment TEXT,
  garment_color TEXT,
  process TEXT,
  print_locations TEXT,
  imprint_colors TEXT,
  total_sizes TEXT,
  total_quantity TEXT,
  total_price TEXT,
  due_date TEXT,
  po_number TEXT,
  rush_order TEXT,
  fulfillment TEXT,
  shipping_address TEXT,
  notes TEXT,
  mockup TEXT,
  status TEXT,
  approval_status TEXT,
  customer_notes TEXT,
  created_at TEXT
);
`).then(() => {
  console.log('TABLE READY');
}).catch(err => {
  console.error('TABLE ERROR:', err);
});
async function getAllJobsDB() {
  const result = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
  return result.rows;
}

async function getJobByIdDB(id) {
  const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
  return result.rows[0];
}

async function createJobDB(job) {
  await pool.query(`
    INSERT INTO jobs (
      id, customer_name, company_name, customer_email,
      garment, garment_color, process, print_locations,
      imprint_colors, total_sizes, total_quantity, total_price,
      due_date, po_number, rush_order, fulfillment, shipping_address,
      notes, mockup, status, approval_status, customer_notes, created_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
      $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
    )
  `, [
    job.id,
    job.customer_name,
    job.company_name,
    job.customer_email,
    job.garment,
    job.garment_color,
    job.process,
    job.print_locations,
    job.imprint_colors,
    job.total_sizes,
    job.total_quantity,
    job.total_price,
    job.due_date,
    job.po_number,
    job.rush_order,
    job.fulfillment,
    job.shipping_address,
    job.notes,
    job.mockup,
    job.status,
    job.approval_status,
    job.customer_notes,
    job.created_at
  ]);
}
/* =========================
   APP SETUP
========================= */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'zander-secret',
  resave: false,
  saveUninitialized: true
}));

/* =========================
   FILE STORAGE
========================= */
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

const DATA_FILE = path.join(__dirname, 'jobs.json');

function ensureJobsFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
}

function getJobs() {
  ensureJobsFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('READ JOBS ERROR:', err);
    return [];
  }
}

function saveJobs(jobs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

function getJobById(id) {
  const jobs = getJobs();
  return jobs.find(j => j.id === id) || null;
}

/* =========================
   HELPERS
========================= */
function requireLogin(req, res, next) {
  if (!req.session.loggedIn) return res.redirect('/login');
  next();
}

function getBaseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function buildPrintLocations(body) {
  if (body.print_locations && body.print_locations.trim()) {
    return body.print_locations.trim();
  }

  const locations = [];
  Object.keys(body)
    .filter(key => key.startsWith('print_location_') && !key.startsWith('print_location_custom_'))
    .sort()
    .forEach(key => {
      const value = body[key];
      if (!value) return;

      if (value === '__custom__') {
        const idx = key.split('_').pop();
        const custom = body[`print_location_custom_${idx}`];
        if (custom && custom.trim()) locations.push(custom.trim());
      } else {
        locations.push(value.trim());
      }
    });

  return locations.join(' / ');
}

function buildGarmentColor(body) {
  if (body.garment_color === '__custom__') {
    return (body.garment_color_custom || '').trim();
  }
  return (body.garment_color || '').trim();
}

function buildTotalSizes(body) {
  if (body.total_sizes && body.total_sizes.trim()) {
    return body.total_sizes.trim();
  }

  const sizes = [
    ['S', body.size_s],
    ['M', body.size_m],
    ['L', body.size_l],
    ['XL', body.size_xl],
    ['2XL', body.size_2xl],
    ['3XL', body.size_3xl],
    ['4XL', body.size_4xl],
    ['5XL', body.size_5xl]
  ];

  return sizes
    .filter(([, val]) => val && String(val).trim() !== '' && String(val) !== '0')
    .map(([label, val]) => `${label}: ${val}`)
    .join(', ');
}

function buildTotalQuantity(body) {
  if (body.total_quantity && body.total_quantity.trim()) {
    return body.total_quantity.trim();
  }

  const values = [
    body.size_s, body.size_m, body.size_l, body.size_xl,
    body.size_2xl, body.size_3xl, body.size_4xl, body.size_5xl
  ];

  const total = values.reduce((sum, val) => {
    const n = parseInt(val || '0', 10);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  return total ? String(total) : '';
}

/* =========================
   EMAIL
========================= */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/* =========================
   AUTH ROUTES
========================= */
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const username = req.body.username || '';
  const password = req.body.password || '';

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.loggedIn = true;
    return res.redirect('/');
  }

  return res.status(401).send('Login failed');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

/* =========================
   DASHBOARD
========================= */
app.get('/', requireLogin, (req, res) => {
  const jobs = getJobs();
  res.render('dashboard', { jobs });
});

/* =========================
   NEW JOB
========================= */
app.get('/jobs/new', requireLogin, (req, res) => {
  res.render('new-job');
});

app.post('/jobs', requireLogin, upload.single('mockup'), (req, res) => {
  const jobs = getJobs();

 
const job = {
  id: uuidv4(),
  customer_name: req.body.customer_name || '',
  company_name: req.body.company_name || '',
  customer_email: req.body.customer_email || '',
  garment: req.body.garment || '',
  garment_color: buildGarmentColor(req.body),
  process: req.body.process || '',
  print_locations: buildPrintLocations(req.body),
  imprint_colors: req.body.imprint_colors || '',
  total_sizes: buildTotalSizes(req.body),
  total_quantity: buildTotalQuantity(req.body),
  total_price: req.body.total_price || '',
  due_date: req.body.due_date || '',
  po_number: req.body.po_number || '',
  rush_order: req.body.rush_order || 'No',
  fulfillment: req.body.fulfillment || '',
   shipping_address: req.body.shipping_address || '',
  notes: req.body.notes || '',
  mockup: req.file ? `/public/uploads/${req.file.filename}` : null,
  status: 'Pending Approval',
  approval_status: 'Waiting',
  customer_notes: '',
  created_at: new Date().toISOString()
};
  jobs.push(job);
  saveJobs(jobs);

  res.redirect('/');
});

/* =========================
   JOB DETAIL / EDIT
========================= */
app.get('/jobs/:id', requireLogin, (req, res) => {
  const job = getJobById(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  res.render('job-detail', { job });
});

app.get('/jobs/:id/edit', requireLogin, (req, res) => {
  const job = getJobById(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  res.render('edit-job', { job });
});

app.post('/jobs/:id/edit', requireLogin, upload.single('mockup'), (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).send('Job not found');

  job.customer_name = req.body.customer_name || '';
  job.company_name = req.body.company_name || '';
  job.customer_email = req.body.customer_email || '';
  job.garment = req.body.garment || '';
  job.garment_color = req.body.garment_color || '';
  job.process = req.body.process || '';
  job.print_locations = req.body.print_locations || '';
  job.imprint_colors = req.body.imprint_colors || '';
  job.total_sizes = req.body.total_sizes || '';
  job.total_quantity = req.body.total_quantity || '';
  job.total_price = req.body.total_price || '';
  job.notes = req.body.notes || '';

  if (req.file) {
    job.mockup = `/public/uploads/${req.file.filename}`;
  }

  saveJobs(jobs);
  res.redirect(`/jobs/${job.id}`);
});

/* =========================
   STATUS / BOARD MOVE
========================= */
app.post('/jobs/:id/status', requireLogin, (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const status = req.body.status || job.status;
  job.status = status;

  if (status === 'Approved') job.approval_status = 'APPROVED';
  if (status === 'Changes Requested') job.approval_status = 'REQUEST CHANGES';

  saveJobs(jobs);
  res.redirect(`/jobs/${req.params.id}`);
});

app.post('/jobs/:id/move', requireLogin, (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);

  if (!job) return res.status(404).json({ ok: false });

  const status = req.body.status || 'Pending Approval';
  job.status = status;

  if (status === 'Approved') job.approval_status = 'APPROVED';
  if (status === 'Changes Requested') job.approval_status = 'REQUEST CHANGES';

  saveJobs(jobs);
  res.json({ ok: true });
});

app.post('/jobs/:id/move-production', requireLogin, (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);

  if (!job) return res.status(404).send('Job not found');

  job.status = 'In Production';
  saveJobs(jobs);

  res.redirect(`/jobs/${job.id}`);
});

/* =========================
   SEND APPROVAL EMAIL
========================= */
app.post('/jobs/:id/send-approval', requireLogin, async (req, res) => {
  try {
    const jobs = getJobs();
    const job = jobs.find(j => j.id === req.params.id);
    if (!job) return res.status(404).send('Job not found');

    if (!job.customer_email || !job.customer_email.includes('@')) {
      return res.status(400).send('Customer email missing or invalid');
    }

    const baseUrl = getBaseUrl(req);
    const approvalLink = `${baseUrl}/approve/${job.id}`;

    const html = `
      <h2>${process.env.SHOP_NAME || 'Zander Ink'} Mockup Approval</h2>
      <p>Please review your mockup below.</p>
      ${job.mockup ? `<p><img src="${baseUrl}${job.mockup}" style="max-width:400px;"></p>` : ''}
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

    res.redirect(`/jobs/${job.id}`);
  } catch (err) {
    console.error('EMAIL SEND ERROR:', err);
    res.status(500).send(`Email failed: ${err.message}`);
  }
});

/* =========================
   CUSTOMER APPROVAL
========================= */
app.get('/approve/:id', (req, res) => {
  const job = getJobById(req.params.id);
  if (!job) return res.status(404).send('Job not found');

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
    job.status = 'Approved';
  } else {
    job.approval_status = 'REQUEST CHANGES';
    job.status = 'Changes Requested';
  }

  job.customer_notes = customerNotes;
  saveJobs(jobs);

  res.render('approval-result', { job });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
