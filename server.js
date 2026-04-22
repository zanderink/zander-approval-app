require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

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

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

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

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

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

app.get('/', requireLogin, async (req, res) => {
  const jobs = await getAllJobsDB();
  res.render('dashboard', { jobs });
});

app.get('/jobs/new', requireLogin, (req, res) => {
  res.render('new-job');
});

app.post('/jobs', requireLogin, upload.single('mockup'), async (req, res) => {
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

console.log('ABOUT TO SAVE JOB:', job);

try {
  await createJobDB(job);
  console.log('JOB SAVED OK:', job.id);
  res.redirect('/');
} catch (err) {
  console.error('DB SAVE ERROR:', err);
  res.status(500).send('Failed to save job');
}
});

app.get('/jobs/:id', requireLogin, async (req, res) => {
  const job = await getJobByIdDB(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  res.render('job-detail', { job });
});

app.get('/jobs/:id/edit', requireLogin, async (req, res) => {
  const job = await getJobByIdDB(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  res.render('edit-job', { job });
});

app.post('/jobs/:id/edit', requireLogin, upload.single('mockup'), async (req, res) => {
  const existing = await getJobByIdDB(req.params.id);
  if (!existing) return res.status(404).send('Job not found');

  const mockup = req.file ? `/public/uploads/${req.file.filename}` : existing.mockup;

  await pool.query(`
    UPDATE jobs SET
      customer_name = $1,
      company_name = $2,
      customer_email = $3,
      garment = $4,
      garment_color = $5,
      process = $6,
      print_locations = $7,
      imprint_colors = $8,
      total_sizes = $9,
      total_quantity = $10,
      total_price = $11,
      due_date = $12,
      po_number = $13,
      rush_order = $14,
      fulfillment = $15,
      shipping_address = $16,
      notes = $17,
      mockup = $18
    WHERE id = $19
  `, [
    req.body.customer_name || '',
    req.body.company_name || '',
    req.body.customer_email || '',
    req.body.garment || '',
    req.body.garment_color || '',
    req.body.process || '',
    req.body.print_locations || '',
    req.body.imprint_colors || '',
    req.body.total_sizes || '',
    req.body.total_quantity || '',
    req.body.total_price || '',
    req.body.due_date || '',
    req.body.po_number || '',
    req.body.rush_order || 'No',
    req.body.fulfillment || '',
    req.body.shipping_address || '',
    req.body.notes || '',
    mockup,
    req.params.id
  ]);

  res.redirect(`/jobs/${req.params.id}`);
});

app.post('/jobs/:id/status', requireLogin, async (req, res) => {
  const job = await getJobByIdDB(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const status = req.body.status || job.status;
  let approvalStatus = job.approval_status;

  if (status === 'Approved') approvalStatus = 'APPROVED';
  if (status === 'Changes Requested') approvalStatus = 'REQUEST CHANGES';

  await pool.query(
    'UPDATE jobs SET status = $1, approval_status = $2 WHERE id = $3',
    [status, approvalStatus, req.params.id]
  );

  res.redirect(`/jobs/${req.params.id}`);
});

app.post('/jobs/:id/move', requireLogin, async (req, res) => {
  const job = await getJobByIdDB(req.params.id);
  if (!job) return res.status(404).json({ ok: false });

  const status = req.body.status || 'Pending Approval';
  let approvalStatus = job.approval_status;

  if (status === 'Approved') approvalStatus = 'APPROVED';
  if (status === 'Changes Requested') approvalStatus = 'REQUEST CHANGES';

  await pool.query(
    'UPDATE jobs SET status = $1, approval_status = $2 WHERE id = $3',
    [status, approvalStatus, req.params.id]
  );

  res.json({ ok: true });
});

app.post('/jobs/:id/send-approval', requireLogin, async (req, res) => {
  try {
    const job = await getJobByIdDB(req.params.id);
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

    await pool.query('UPDATE jobs SET status = $1 WHERE id = $2', ['Sent', job.id]);

    res.redirect(`/jobs/${job.id}`);
  } catch (err) {
    console.error('EMAIL SEND ERROR:', err);
    res.status(500).send(`Email failed: ${err.message}`);
  }
});

app.get('/approve/:id', async (req, res) => {
  const job = await getJobByIdDB(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  res.render('customer-approval', { job });
});

app.post('/approve/:id', async (req, res) => {
  const job = await getJobByIdDB(req.params.id);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  const action = req.body.action;
  const customerNotes = req.body.customer_notes || '';

  let status = job.status;
  let approvalStatus = job.approval_status;

  if (action === 'approve') {
    approvalStatus = 'APPROVED';
    status = 'Approved';
  } else {
    approvalStatus = 'REQUEST CHANGES';
    status = 'Changes Requested';
  }

  await pool.query(
    'UPDATE jobs SET status = $1, approval_status = $2, customer_notes = $3 WHERE id = $4',
    [status, approvalStatus, customerNotes, req.params.id]
  );

  const updatedJob = await getJobByIdDB(req.params.id);

  res.render('approval-result', { job: updatedJob });
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
