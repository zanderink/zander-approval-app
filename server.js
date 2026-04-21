<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><%= title %></title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div class="print-shell">
    <div class="print-head">
      <div>
        <h1 style="margin:0;"><%= shopName %> Production Sheet</h1>
        <div>Job <strong><%= job.job_number %></strong></div>
      </div>
      <div class="no-print">
        <button class="btn btn-primary" onclick="window.print()">Print</button>
      </div>
    </div>

    <div class="print-grid">
      <div class="print-box">
        <h3>Customer</h3>
        <p><strong>Name:</strong> <%= job.customer_name || '—' %><br>
        <strong>Company:</strong> <%= job.company_name || '—' %><br>
        <strong>Email:</strong> <%= job.customer_email || '—' %><br>
        <strong>Due:</strong> <%= job.due_date || '—' %></p>
      </div>
      <div class="print-box">
        <h3>Order</h3>
        <p><strong>Garment:</strong> <%= job.garment || '—' %><br>
        <strong>Garment Color:</strong> <%= job.garment_color || '—' %><br>
        <strong>Process:</strong> <%= job.process || '—' %><br>
        <strong>Print Locations:</strong> <%= job.print_locations || '—' %><br>
        <strong>Imprint Colors:</strong> <%= job.imprint_colors || '—' %></p>
      </div>
      <div class="print-box">
        <h3>Sizes</h3>
        <div style="white-space:pre-line;"><%= job.total_sizes || '—' %></div>
        <p><strong>Total Units:</strong> <%= job.total_quantity || '—' %></p>
      </div>
      <div class="print-box">
        <h3>Production Notes</h3>
        <p><strong>Internal Notes:</strong><br><span style="white-space:pre-line;"><%= job.internal_notes || '—' %></span></p>
        <p><strong>Customer Notes:</strong><br><span style="white-space:pre-line;"><%= job.customer_notes || '—' %></span></p>
        <p><strong>Price:</strong> <%= job.total_price || '—' %><br>
        <strong>Shipping:</strong> <%= job.shipping_method || '—' %></p>
      </div>
    </div>

    <% if (job.mockup_revisions && job.mockup_revisions.length) { %>
      <div class="print-box" style="margin-top:18px;">
        <h3>Mockup</h3>
        <img src="/uploads/<%= job.mockup_revisions[0].filename %>" alt="Mockup" style="max-width:100%;max-height:500px;border:1px solid #ccc;border-radius:12px;" />
      </div>
    <% } %>
  </div>
</body>
</html>
