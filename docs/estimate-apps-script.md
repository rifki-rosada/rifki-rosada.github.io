# Estimate Lead Capture with Google Apps Script

This guide documents an optional Google Apps Script bridge for the `/estimate/` page. It receives estimator submissions, validates the required lead fields server-side, appends sanitized lead data to Google Sheets, and emails a notification to Rifki.

Use obvious placeholders while setting this up. Do not commit real Sheet IDs, deployment URLs, credentials, or local `.env` files.

## 1. Google Sheet setup

1. Create a new Google Sheet for estimator leads.
2. Name the first tab `Estimate Leads`.
3. Copy the spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit`
4. Keep the Sheet private to the Google account that owns the Apps Script.
5. Add the headers from the next section in row 1, or let the script create them on the first submission.

## 2. Expected Sheet columns

The script below writes one row per submission with these columns:

```text
submitted_at
received_at
source
source_page
page_url
lead_fit_label
lead_fit_score
estimated_range
recommended_package
recommended_package_id
estimated_timeline
complexity_label
complexity_score
market
currency
location
business_type
automation_needs
current_process
team_size
integrations
data_complexity
urgency
budget_readiness
name
company
email
whatsapp
project_description
lead_signals
low_fit_signals
utm_source
utm_medium
utm_campaign
utm_content
utm_term
gclid
fbclid
msclkid
```

The script intentionally does not store IP address, browser fingerprint, user agent, or any hidden tracking identifier beyond UTM/ad click fields already sent by the estimator payload.

## 3. Apps Script code

Create a new Apps Script project from the Sheet with **Extensions > Apps Script**, then paste this code into `Code.gs`.

Replace only these placeholders:

- `SPREADSHEET_ID_HERE`
- `YOUR_EMAIL@example.com`

```javascript
const CONFIG = {
  SPREADSHEET_ID: "SPREADSHEET_ID_HERE",
  SHEET_NAME: "Estimate Leads",
  NOTIFY_EMAIL: "YOUR_EMAIL@example.com"
};

const COLUMNS = [
  "submitted_at",
  "received_at",
  "source",
  "source_page",
  "page_url",
  "lead_fit_label",
  "lead_fit_score",
  "estimated_range",
  "recommended_package",
  "recommended_package_id",
  "estimated_timeline",
  "complexity_label",
  "complexity_score",
  "market",
  "currency",
  "location",
  "business_type",
  "automation_needs",
  "current_process",
  "team_size",
  "integrations",
  "data_complexity",
  "urgency",
  "budget_readiness",
  "name",
  "company",
  "email",
  "whatsapp",
  "project_description",
  "lead_signals",
  "low_fit_signals",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "msclkid"
];

const REQUIRED_SELECTED_FIELDS = [
  "location",
  "businessType",
  "currentProcess",
  "teamSize",
  "integrations",
  "dataComplexity",
  "urgency",
  "budgetReadiness"
];

function doPost(event) {
  try {
    const payload = parsePayload_(event);
    const validation = validatePayload_(payload);

    if (!validation.ok) {
      return json_({ ok: false, error: validation.error });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getSheet_();
      ensureHeaders_(sheet);
      sheet.appendRow(buildRow_(payload));
    } finally {
      lock.releaseLock();
    }

    sendLeadNotification_(payload);
    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: "Unable to record estimate lead." });
  }
}

function parsePayload_(event) {
  const rawBody = event && event.postData && event.postData.contents;

  if (!rawBody || rawBody.length > 50000) {
    throw new Error("Invalid request body.");
  }

  const payload = JSON.parse(rawBody);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload must be a JSON object.");
  }

  return payload;
}

function validatePayload_(payload) {
  if (hasText_(payload.website) || hasText_(payload.honeypot) || hasText_(payload._gotcha)) {
    return { ok: false, error: "Spam submission rejected." };
  }

  if (!hasText_(payload.name)) {
    return { ok: false, error: "Name is required." };
  }

  if (!hasText_(payload.projectDescription)) {
    return { ok: false, error: "Project description is required." };
  }

  if (!hasText_(payload.email) && !hasText_(payload.whatsapp)) {
    return { ok: false, error: "Email or WhatsApp is required." };
  }

  if (hasText_(payload.email) && !isValidEmail_(payload.email)) {
    return { ok: false, error: "Email is invalid." };
  }

  const selectedAnswers = payload.selectedAnswers || {};

  for (const field of REQUIRED_SELECTED_FIELDS) {
    if (!hasText_(selectedAnswers[field])) {
      return { ok: false, error: `Missing selected answer: ${field}.` };
    }
  }

  if (!Array.isArray(selectedAnswers.automationNeeds) || selectedAnswers.automationNeeds.length === 0) {
    return { ok: false, error: "At least one automation need is required." };
  }

  if (!hasText_(payload.recommendedPackage) || !hasText_(payload.estimatedRange) || !hasText_(payload.estimatedTimeline)) {
    return { ok: false, error: "Estimate result fields are required." };
  }

  return { ok: true };
}

function buildRow_(payload) {
  const selectedAnswers = payload.selectedAnswers || {};
  const selectedLabels = payload.selectedAnswerLabels || {};
  const utm = payload.utm || {};

  const values = {
    submitted_at: cleanText_(payload.submittedAt, 80),
    received_at: new Date().toISOString(),
    source: cleanText_(payload.source, 80),
    source_page: cleanText_(payload.sourcePage, 80),
    page_url: cleanUrl_(payload.pageUrl || payload.currentUrl),
    lead_fit_label: cleanText_(payload.leadFitLabel, 80),
    lead_fit_score: cleanNumber_(payload.leadFitScore),
    estimated_range: cleanText_(payload.estimatedRange, 120),
    recommended_package: cleanText_(payload.recommendedPackage, 160),
    recommended_package_id: cleanText_(payload.recommendedPackageId, 80),
    estimated_timeline: cleanText_(payload.estimatedTimeline, 80),
    complexity_label: cleanText_(payload.complexityLabel, 80),
    complexity_score: cleanNumber_(payload.complexityScore),
    market: cleanText_(payload.market, 40),
    currency: cleanText_(payload.currency, 12),
    location: cleanText_(selectedLabels.location || payload.locationLabel || selectedAnswers.location, 120),
    business_type: cleanText_(selectedLabels.businessType || payload.businessTypeLabel || selectedAnswers.businessType, 160),
    automation_needs: cleanArray_(selectedLabels.automationNeeds || payload.automationNeedLabels || selectedAnswers.automationNeeds, 1200),
    current_process: cleanText_(selectedLabels.currentProcess || payload.currentProcessLabel || selectedAnswers.currentProcess, 160),
    team_size: cleanText_(selectedLabels.teamSize || payload.teamSizeLabel || selectedAnswers.teamSize, 80),
    integrations: cleanText_(selectedLabels.integrations || payload.integrationsLabel || selectedAnswers.integrations, 120),
    data_complexity: cleanText_(selectedLabels.dataComplexity || payload.dataComplexityLabel || selectedAnswers.dataComplexity, 160),
    urgency: cleanText_(selectedLabels.urgency || payload.urgencyLabel || selectedAnswers.urgency, 120),
    budget_readiness: cleanText_(selectedLabels.budgetReadiness || payload.budgetReadinessLabel || selectedAnswers.budgetReadiness, 120),
    name: cleanText_(payload.name, 120),
    company: cleanText_(payload.company, 160),
    email: cleanText_(payload.email, 180).toLowerCase(),
    whatsapp: cleanText_(payload.whatsapp, 120),
    project_description: cleanLongText_(payload.projectDescription, 2400),
    lead_signals: cleanArray_(payload.leadSignals, 1200),
    low_fit_signals: cleanArray_(payload.lowFitSignals, 1200),
    utm_source: cleanText_(utm.utm_source, 220),
    utm_medium: cleanText_(utm.utm_medium, 220),
    utm_campaign: cleanText_(utm.utm_campaign, 220),
    utm_content: cleanText_(utm.utm_content, 220),
    utm_term: cleanText_(utm.utm_term, 220),
    gclid: cleanText_(utm.gclid, 220),
    fbclid: cleanText_(utm.fbclid, 220),
    msclkid: cleanText_(utm.msclkid, 220)
  };

  return COLUMNS.map((column) => (values[column] === undefined || values[column] === null ? "" : values[column]));
}

function sendLeadNotification_(payload) {
  const selectedAnswers = payload.selectedAnswers || {};
  const selectedLabels = payload.selectedAnswerLabels || {};
  const subject = `[Estimate] ${cleanText_(payload.leadFitLabel || "New lead", 40)} - ${cleanText_(payload.name, 80)}`;

  const body = [
    "New automation estimate lead",
    "",
    `Lead fit: ${cleanText_(payload.leadFitLabel, 80)} (${cleanNumber_(payload.leadFitScore)})`,
    `Package: ${cleanText_(payload.recommendedPackage, 160)}`,
    `Range: ${cleanText_(payload.estimatedRange, 120)}`,
    `Timeline: ${cleanText_(payload.estimatedTimeline, 80)}`,
    `Complexity: ${cleanText_(payload.complexityLabel, 80)} (${cleanNumber_(payload.complexityScore)})`,
    "",
    `Name: ${cleanText_(payload.name, 120)}`,
    `Company: ${cleanText_(payload.company, 160) || "-"}`,
    `Email: ${cleanText_(payload.email, 180) || "-"}`,
    `WhatsApp: ${cleanText_(payload.whatsapp, 120) || "-"}`,
    "",
    `Location: ${cleanText_(selectedLabels.location || selectedAnswers.location, 120)}`,
    `Business type: ${cleanText_(selectedLabels.businessType || selectedAnswers.businessType, 160)}`,
    `Needs: ${cleanArray_(selectedLabels.automationNeeds || selectedAnswers.automationNeeds, 1200)}`,
    `Current process: ${cleanText_(selectedLabels.currentProcess || selectedAnswers.currentProcess, 160)}`,
    `Team size: ${cleanText_(selectedLabels.teamSize || selectedAnswers.teamSize, 80)}`,
    `Integrations: ${cleanText_(selectedLabels.integrations || selectedAnswers.integrations, 120)}`,
    `Data complexity: ${cleanText_(selectedLabels.dataComplexity || selectedAnswers.dataComplexity, 160)}`,
    `Urgency: ${cleanText_(selectedLabels.urgency || selectedAnswers.urgency, 120)}`,
    `Budget readiness: ${cleanText_(selectedLabels.budgetReadiness || selectedAnswers.budgetReadiness, 120)}`,
    "",
    "Project description:",
    cleanLongText_(payload.projectDescription, 2400),
    "",
    `Page: ${cleanUrl_(payload.pageUrl || payload.currentUrl)}`,
    `UTM source: ${cleanText_((payload.utm || {}).utm_source, 220) || "-"}`
  ].join("\n");

  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject,
    body,
    name: "Portfolio Estimate"
  });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  return spreadsheet.getSheetByName(CONFIG.SHEET_NAME) || spreadsheet.insertSheet(CONFIG.SHEET_NAME);
}

function ensureHeaders_(sheet) {
  const range = sheet.getRange(1, 1, 1, COLUMNS.length);
  const current = range.getValues()[0];
  const needsHeaders = COLUMNS.some((column, index) => current[index] !== column);

  if (needsHeaders) {
    range.setValues([COLUMNS]);
    sheet.setFrozenRows(1);
  }
}

function hasText_(value) {
  return String(value || "").trim().length > 0;
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function cleanText_(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanLongText_(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function cleanUrl_(value) {
  const text = cleanText_(value, 500);
  return /^https?:\/\//i.test(text) ? text : "";
}

function cleanNumber_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function cleanArray_(value, maxLength) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return items.map((item) => cleanText_(item, 180)).filter(Boolean).join(", ").slice(0, maxLength);
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
```

## 4. Web app deployment steps

1. In Apps Script, click **Deploy > New deployment**.
2. Choose **Web app**.
3. Set **Description** to something like `Portfolio estimate lead capture`.
4. Set **Execute as** to `Me`.
5. Set **Who has access** to `Anyone`.
6. Click **Deploy** and approve the requested Google Sheets and Gmail permissions.
7. Copy the generated web app URL:
   `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec`

When you update the script later, create a new deployment version or edit the existing deployment so the live web app receives the latest code.

## 5. Required access setting

The estimator submits from a public static GitHub Pages site, so the Apps Script web app must allow anonymous public POST requests.

Use:

- **Execute as:** `Me`
- **Who has access:** `Anyone`

Do not use `Anyone with Google account`; many leads will not be logged into Google.

## 6. How to set `ESTIMATE_WEBHOOK_URL`

The build script reads `ESTIMATE_WEBHOOK_URL` and embeds it into the generated estimator page.

For a local release build:

```bash
ESTIMATE_WEBHOOK_URL="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" npm run build
npm run check
```

For local testing with a `.env`, keep the file untracked:

```bash
ESTIMATE_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

The repo already ignores `.env` and `.env.*`. Keep `.env.example` blank.

Important: the web app URL is not a credential, but it is a public submission endpoint once embedded in HTML. Treat it as rotatable. Do not commit private Sheet IDs, Apps Script code secrets, service account keys, or Google Sheet URLs.

## 7. How to test with a fake lead

Use the sample payload in `docs/estimate-sample-payload.json`.

With the deployed Apps Script URL:

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  --data-binary @docs/estimate-sample-payload.json
```

Expected result:

```json
{"ok":true}
```

Then confirm:

- A new row appears in the `Estimate Leads` Sheet.
- The notification email arrives at `YOUR_EMAIL@example.com`.
- No IP address or browser fingerprint columns are present.

Test rejection cases by sending copies of the sample with:

- Empty `name`
- Empty `projectDescription`
- Empty `email` and empty `whatsapp`
- A non-empty `website`, `honeypot`, or `_gotcha` field

Each should return `{"ok":false,"error":"..."}`.

## 8. Spam and security limitations

This bridge is deliberately lightweight for a static portfolio site:

- The Apps Script URL is public once configured.
- Honeypot filtering blocks simple bots, not determined abuse.
- Client-side validation can be bypassed.
- Apps Script quotas can be exhausted by high-volume spam.
- Gmail notification quotas apply.
- Apps Script web apps do not provide strong request authentication for anonymous visitors.
- The estimator uses `fetch(..., { mode: "no-cors" })`, so the browser cannot read the JSON response. The JSON response is still useful for direct tests and server logs.

If ad traffic increases, consider adding one or more of:

- A challenge step such as Turnstile or reCAPTCHA.
- A signed proxy endpoint on Cloudflare Workers, Vercel, or another server layer.
- Per-day submission caps in Apps Script.
- Duplicate suppression by email/WhatsApp plus recent timestamp.
- A manual review label before syncing leads into a CRM.

## 9. Server-side validation notes

The template validates the critical lead-capture requirements server-side:

- JSON body must be present and under 50 KB.
- Honeypot fields must be empty.
- `name` is required.
- `projectDescription` is required.
- At least one of `email` or `whatsapp` is required.
- Email format is checked when email is provided.
- Required selected answers must be present.
- At least one automation need must be selected.
- Estimate result fields must be present.

For stricter production validation, keep an enum map in Apps Script that mirrors `content/estimate.json` and reject unknown option values. For maximum integrity, recompute the estimate server-side instead of trusting the client-provided package, range, complexity, and lead-fit labels.
