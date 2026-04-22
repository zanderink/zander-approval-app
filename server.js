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

async function initDb() {
  await pool.query(`
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
      notes TEXT,
      mockup TEXT,
      status TEXT DEFAULT 'Pending Approval',
      approval_status TEXT DEFAULT 'Waiting',
      customer_notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

function requireLogin(req, res, next) {
  if (!req.session.loggedIn) return res.redirect('/login');
  next();
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function getJobs() {
  const result = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
  return result.rows;
}

async function getJobById(id) {
  const result = await pool.query('SELECT * FROM jobs WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] || null;
}

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
  res.status(401).send('Login failed');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/', requireLogin, async (req, res) => {
  const jobs = await getJobs();
  res.render('dashboard', { jobs });
});

app.get('/jobs/new', requireLogin, (req, res) => {
  res.render('new-job');
});

app.post('/jobs', requireLogin, upload.single('mockup'), async (req, res) => {
  const id = uuidv4();

  const sizeParts = [];
  const sizeMap = [
    ['S', req.body.size_s],
    ['M', req.body.size_m],
    ['L', req.body.size_l],
    ['XL', req.body.size_xl],
    ['2XL', req.body.size_2xl],
    ['3XL', req.body.size_3xl],
    ['4XL', req.body.size_4xl],
    ['5XL', req.body.size_5xl]
  ];

  for (const [label, value] of sizeMap) {
    if (value && String(value).trim() !== '' && String(value) !== '0') {
      sizeParts.push(`${label}: ${value}`);
    }
  }

  const totalSizes = sizeParts.join(', ');
  const totalQuantity = sizeMap.reduce((sum, [, value]) => {
    const n = parseInt(value || '0', 10);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  const printLocations =
    req.body.print_locations ||
    Object.keys(req.body)
      .filter(k => k.startsWith('print_location_') && !k.startsWith('print_location_custom_'))
      .map(k => {
        const val = req.body[k];
        if (val === '__custom__') {
          const idx = k.split('_').pop();
          return req.body[`print_location_custom_${idx}`] || '';
        }
        return val || '';
      })
      .filter(Boolean)
      .join(' / ');

  const garmentColor =
    req.body.garment_color === '__custom__'
      ? (req.body.garment_color_custom || '')
      : (req.body.garment_color || '');

  const mockup = req.file ? `/public/uploads/${req.file.filename}` : null;

  await pool.query(
    `INSERT INTO jobs (
      id, customer_name, company_name, customer_email,
      garment, garment_color, process, print_locations,
      imprint_colors, total_sizes, total_quantity, total_price,
      notes, mockup, status, approval_status
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,$8,
      $9,$10,$11,$12,
      $13,$14,$15,$16
    )`,
    [
      id,
      req.body.customer_name || '',
      req.body.company_name || '',
      req.body.customer_email || '',
      req.body.garment || '',
      garmentColor,
      req.body.process || '',
      printLocations || '',
      req.body.imprint_colors || '',
      totalSizes || '',
      String(totalQuantity || ''),
      req.body.total_price || '',
      req.body.notes || '',
      mockup,
      'Pending Approval',
      'Waiting'
    ]
  );

  res.redirect('/');
});

app.get('/jobs/:id', requireLogin, async (req, res) => {
  const job = await getJobById(req.params.id);
  if (!job) return res.status(404).send('Job not found');
  res.render('job-detail', { job });
});

app.get('/jobs/:id/edit', requireLogin, async (req, res) => {
  const job = await getJobById(req.params.id);
  if (!job) return res.status(404).send('Job not found');
  res.render('edit-job', { job });
});

app.post('/jobs/:id/edit', requireLogin, upload.single('mockup'), async (req, res) => {
  const job = await getJobById(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  let mockup = job.mockup;
  if (req.file) {
    mockup = `/public/uploads/${req.file.filename}`;
  }

  await pool.query(
    `UPDATE jobs SET
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
      notes = $12,
      mockup = $13
    WHERE id = $14`,
    [
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
      req.body.notes || '',
      mockup,
      req.params.id
    ]
  );

  res.redirect(`/jobs/${req.params.id}`);
});

app.post('/jobs/:id/status', requireLogin, async (req, res) => {
  const job = await getJobById(req.params.id);
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

app.post('/jobs/:id/send-approval', requireLogin, async (req, res) => {
  try {
    const job = await getJobById(req.params.id);
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

    await pool.query('UPDATE jobs SET status = $1 WHERE id = $2', ['Sent', job.id]);

    res.redirect(`/jobs/${job.id}`);
  } catch (err) {
    console.error('EMAIL SEND ERROR:', err);
    res.status(500).send(`Email failed: ${err.message}`);
  }
});

app.get('/approve/:id', async (req, res) => {
  const job = await getJobById(req.params.id);
  if (!job) return res.status(404).send('Job not found');
  res.render('customer-approval', { job });
});

app.post('/approve/:id', async (req, res) => {
  const job = await getJobById(req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const action = req.body.action;
  const customerNotes = req.body.customer_notes || '';

  let approvalStatus = 'REQUEST CHANGES';
  let status = 'Changes Requested';

  if (action === 'approve') {
    approvalStatus = 'APPROVED';
    status = 'Approved';
  }

  await pool.query(
    'UPDATE jobs SET approval_status = $1, status = $2, customer_notes = $3 WHERE id = $4',
    [approvalStatus, status, customerNotes, req.params.id]
  );

  const updatedJob = await getJobById(req.params.id);
  res.render('approval-result', { job: updatedJob });
});

app.post('/jobs/:id/move', requireLogin, async (req, res) => {
  const job = await getJobById(req.params.id);
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

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });
  })
  .catch(err => {
    console.error('DB INIT ERROR:', err);
    process.exit(1);
  });
