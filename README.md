<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><%= title %></title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div class="center-shell" style="background:#f5f6f8;display:block;min-height:auto;">
    <div class="customer-box" style="margin:28px auto;">
      <div class="customer-head hero-brand-panel">
        <img src="/zander-mark.svg" alt="<%= shopName %>" class="hero-logo" />
        <h1><%= shopName %> Mockup Approval</h1>
        <div>Please review your order details and either approve it or request changes.</div>
      </div>
      <div class="customer-inner customer-layout">
        <div>
          <div class="mockup">
            <h2 style="margin-top:0;">Your Mockup</h2>
            <% if (job.mockup_revisions && job.mockup_revisions.length) { %>
              <img src="/uploads/<%= job.mockup_revisions[0].filename %>" alt="Mockup" />
            <% } else { %>
              <div class="note">No mockup image attached yet.</div>
            <% } %>
          </div>
        </div>
        <div>
          <div class="panel">
            <h2 style="margin-top:0;">Order Details</h2>
            <div class="kv">
              <div><strong>Customer</strong></div><div><%= job.customer_name || '—' %></div>
              <div><strong>Job Number</strong></div><div><%= job.job_number || '—' %></div>
              <div><strong>Company</strong></div><div><%= job.company_name || '—' %></div>
              <div><strong>Garment</strong></div><div><%= job.garment || '—' %></div>
              <div><strong>Garment Color</strong></div><div><%= job.garment_color || '—' %></div>
              <div><strong>Imprint Colors</strong></div><div><%= job.imprint_colors || '—' %></div>
              <div><strong>Total Sizes</strong></div><div style="white-space:pre-line;"><%= job.total_sizes || '—' %></div>
              <div><strong>Total Quantity</strong></div><div><%= job.total_quantity || '—' %></div>
              <div><strong>Total Price</strong></div><div><%= job.total_price || '—' %></div>
            </div>
          </div>
          <div class="panel" style="margin-top:16px;">
            <h2 style="margin-top:0;">Approve or Request Changes</h2>
            <form action="/approve/<%= job.approval_token %>/respond" method="post">
              <label>Comments or requested changes</label>
              <textarea name="customer_notes" placeholder="Example: move the back print up 1 inch, change red to royal, or looks good to go."></textarea>
              <div class="button-row" style="margin-top:14px;">
                <button class="btn btn-green" type="submit" name="decision" value="approve">Approve Mockup</button>
                <button class="btn btn-red" type="submit" name="decision" value="changes">Request Changes</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
