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

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
  })
);

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
    cb(null, safeName);
  }
});
const upload = multer({ storage });

const dataFile = path.join(__dirname, 'jobs.json');

function getJobs() {
  if (!fs.existsSync(dataFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    return [];
  }
}

function saveJobs(jobs) {
  fs.writeFileSync(dataFile, JSON.stringify(jobs, null, 2));
}

function requireLogin(req, res, next) {
  if (!req.session.loggedIn) return res.redirect('/login');
  next();
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

app.get('/', requireLogin, (req, res) => {
  const jobs = getJobs().reverse();
  res.render('dashboard', { jobs });
});

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

app.get('/jobs/new', requireLogin, (req, res) => {
  res.render('new-job', {
    garmentOptions: ['Shirt', 'Long Sleeve', 'Hoodie', 'Jacket', 'Polo', '1/4 Zip'],
    garmentColorOptions: [
      'Black',
      'White',
      'Sport Grey',
      'Dark Heather',
      'Red',
      'Maroon',
      'Royal',
      'Navy',
      'Carolina Blue',
      'Forest Green',
      'Orange',
      'Purple',
      'Gold',
      'Sand'
    ],
    processOptions: ['Screen Print', 'Embroidery', 'Direct to Film'],
    printLocationOptions: [
      'Front Left Chest',
      'Front Left Chest / Back',
      'Full Front',
      'Full Front / Full Back',
      'Sleeve'
    ],
    sizeOrder: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']
  });
});

app.post('/jobs', requireLogin, upload.single('mockup'), (req, res) => {
  const jobs = getJobs();

  const job = {
    id: uuidv4(),
    created_at: new Date().toISOString(),
    customer_name: req.body.customer_name || '',
    company_name: req.body.company_name || '',
    customer_email: req.body.customer_email || '',
    garment: req.body.garment || '',
    garment_color: req.body.garment_color || '',
    imprint_colors: req.body.imprint_colors || '',
    print_locations: req.body.print_locations || '',
    total_sizes: req.body.total_sizes || '',
    total_quantity: req.body.total_quantity || '',
    total_price: req.body.total_price || '',
    notes: req.body.notes || '',
    status: 'Pending Approval',
    approval_status: 'Waiting',
    mockup: req.file ? `/public/uploads/${req.file.filename}` : ''
  };

  jobs.push(job);
  saveJobs(jobs);

  res.redirect('/');
});

app.get('/jobs/:id', requireLogin, (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).send('Job not found');
  res.render('job-detail', { job });
});

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
      <p><strong>Total Sizes:</strong> ${job.total_sizes || '-'}</p>
      <p><strong>Total Quantity:</strong> ${job.total_quantity || '-'}</p>
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

  job.status = 'Sent';
  saveJobs(jobs);

  res.redirect(`/jobs/${job.id}`);
});

app.get('/approve/:id', (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).send('Job not found');
  res.render('customer-approval', { job });
});

app.post('/approve/:id', (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).send('Job not found');

  const action = req.body.action;
  const customer_notes = req.body.customer_notes || '';

  if (action === 'approve') {
    job.approval_status = 'APPROVED';
    job.status = 'Ready for Production';
  } else {
    job.approval_status = 'REQUEST CHANGES';
    job.status = 'Changes Requested';
  }

  job.customer_notes = customer_notes;
  saveJobs(jobs);

  res.render('approval-result', { job });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
