import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const rootDir = process.cwd();
const siteDataPath = path.join(rootDir, "content", "site-data.json");
const caseStudiesPath = path.join(rootDir, "content", "case-studies.json");
const notesPath = path.join(rootDir, "content", "notes.json");
const estimateDataPath = path.join(rootDir, "content", "estimate.json");
const estimateScriptPath = path.join(rootDir, "assets", "js", "estimate.js");
const isCheckMode = process.argv.includes("--check");

const [siteDataRaw, caseStudiesRaw, notesRaw, estimateDataRaw] = await Promise.all([
  fs.readFile(siteDataPath, "utf8"),
  fs.readFile(caseStudiesPath, "utf8"),
  fs.readFile(notesPath, "utf8").catch(() => null),
  fs.readFile(estimateDataPath, "utf8")
]);

const siteData = JSON.parse(siteDataRaw.replace(/^\uFEFF/, ""));
const caseStudiesInput = JSON.parse(caseStudiesRaw.replace(/^\uFEFF/, ""));
const notesData = notesRaw ? JSON.parse(notesRaw.replace(/^\uFEFF/, "")) : { posts: [] };
const estimateData = JSON.parse(estimateDataRaw.replace(/^\uFEFF/, ""));
const notes = (notesData.posts || []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

const requiredCaseSlugs = [
  "enterprise-crm-sales-pipeline-performance-system",
  "media-app-android-ai-chat-search-ux",
  "automation-workflows-n8n-gas-api-integrations",
  "multi-surface-monorepo-nextjs-nestjs-platform",
  "social-feed-ui-fixes-cards-polish"
];

const siteUrl = String(siteData.site?.url || "").replace(/\/+$/, "");
if (!siteUrl.startsWith("https://")) {
  throw new Error("content/site-data.json must include an https site.url value.");
}

const buildDate = await latestModifiedDate([
  siteDataPath,
  caseStudiesPath,
  estimateDataPath,
  path.join(rootDir, "scripts", "build-site.mjs"),
  path.join(rootDir, "assets", "css", "site.css"),
  path.join(rootDir, "assets", "js", "site.js"),
  estimateScriptPath
]);

const estimateWebhookEndpoint = String(
  process.env.ESTIMATE_WEBHOOK_URL || siteData.estimate?.webhookEndpoint || estimateData.webhookEndpoint || ""
).trim();
if (estimateWebhookEndpoint && !estimateWebhookEndpoint.startsWith("https://")) {
  throw new Error("ESTIMATE_WEBHOOK_URL or estimate.webhookEndpoint must be an https URL when provided.");
}

const caseStudies = caseStudiesInput
  .map((item) => ({
    ...item,
    route: `/work/${item.slug}/`
  }))
  .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

const clientCaseStudies = caseStudies.filter((item) => item.type === "client");
const publicCaseStudies = caseStudies.filter((item) => item.type === "public");
const workPreviewVisualSlugs = new Set(caseStudies.map((item) => item.slug));

for (const slug of requiredCaseSlugs) {
  if (!caseStudies.some((item) => item.slug === slug)) {
    throw new Error(`Missing required case study slug: ${slug}`);
  }
}

const slugSet = new Set();
for (const item of caseStudies) {
  if (!item.slug || slugSet.has(item.slug)) {
    throw new Error(`Case study slug must be unique and non-empty. Problem slug: ${item.slug}`);
  }
  slugSet.add(item.slug);
}

validateContentData();

const navItems = [
  { label: "Home", href: "/" },
  { label: "Work", href: "/work/" },
  { label: "Writing", href: "/writing/" },
  { label: "Estimate", href: "/estimate/" },
  { label: "Hire", href: "/hire/" },
  { label: "Contact", href: "/contact/" }
];

const footerNavItems = [
  { label: "Home", href: "/" },
  { label: "Work", href: "/work/" },
  { label: "Writing", href: "/writing/" },
  { label: "Estimate", href: "/estimate/" },
  { label: "Hire", href: "/hire/" },
  { label: "Contact", href: "/contact/" }
];
const writtenFiles = [];
const checkMismatches = new Set();

function ensureTrailingSlash(route) {
  if (route === "/") return "/";
  return route.endsWith("/") ? route : `${route}/`;
}

function toAbsoluteUrl(route) {
  return `${siteUrl}${ensureTrailingSlash(route)}`;
}

function normalizeRoute(route) {
  if (!route) return "/";
  const noHash = route.split("#")[0].split("?")[0] || "/";
  const normalized = noHash.endsWith("/") ? noHash : `${noHash}/`;
  return normalized.replace(/\/index\.html\/$/i, "/");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function animationDelay(index, step = 0.05, offset = 0) {
  return `${(offset + (index + 1) * step).toFixed(2)}s`;
}

function renderJsonLd(payload) {
  const list = Array.isArray(payload) ? payload : [payload];
  const safe = JSON.stringify(list).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${safe}</script>`;
}

function isActiveNavLink(currentRoute, href) {
  const current = normalizeRoute(currentRoute);
  const target = normalizeRoute(href);
  if (target === "/") {
    return current === "/";
  }
  return current.startsWith(target);
}

function externalLinkAttributes(url) {
  return String(url).startsWith("http") ? ' target="_blank" rel="noopener noreferrer"' : "";
}

function scopeMailHref() {
  const subject = "Project scope inquiry";
  const body = [
    "Hi Rifki,",
    "",
    "I would like to discuss this project:",
    "",
    ...(siteData.scopeTemplate || []),
    "",
    "Timeline:",
    "",
    "Best,"
  ].join("\n");

  return `mailto:${siteData.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function emailProjectBriefHref() {
  return `mailto:${siteData.contact.email}`;
}

function estimateMailHref(summary = "") {
  const subject = "Automation estimate request";
  const body = summary || [
    "Hi Rifki,",
    "",
    "I completed the automation estimator and would like to discuss the scope.",
    "",
    "Project summary:",
    "",
    "Best,"
  ].join("\n");

  return `mailto:${siteData.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function resumeHref() {
  return siteData.resume?.href || "/Profile.pdf";
}

function resumeLabel() {
  return siteData.resume?.label || "Resume";
}

function findCaseStudy(slug) {
  return caseStudies.find((item) => item.slug === slug) || null;
}

function resolveRelatedCases(caseStudy) {
  const explicit = (caseStudy.relatedSlugs || [])
    .map((slug) => findCaseStudy(slug))
    .filter(Boolean)
    .slice(0, 3);

  if (explicit.length > 0) {
    return explicit;
  }

  return caseStudies
    .filter((item) => item.slug !== caseStudy.slug && item.type === caseStudy.type)
    .slice(0, 3);
}

function renderNavLinks(currentRoute, mobile = false) {
  return navItems
    .map((item) => {
      const active = isActiveNavLink(currentRoute, item.href) ? ' aria-current="page"' : "";
      if (mobile) {
        return `<li><a href="${escapeAttribute(item.href)}"${active}>${escapeHtml(item.label)}</a></li>`;
      }
      return `<a href="${escapeAttribute(item.href)}"${active}>${escapeHtml(item.label)}</a>`;
    })
    .join("");
}

function renderFooterNavLinks() {
  return footerNavItems
    .map(
      (item) => `
        <li>
          <a class="footer-nav-link" href="${escapeAttribute(item.href)}">${escapeHtml(item.label)}</a>
        </li>
      `
    )
    .join("");
}

function renderHeader(currentRoute) {
  return `
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header" role="banner">
      <div class="container header-inner">
        <a class="brand" href="/" aria-label="${escapeAttribute(siteData.site.name)} home">
          <span class="brand-mark" aria-hidden="true">RR</span>
          <span class="brand-name">${escapeHtml(siteData.site.name)}</span>
        </a>
        <nav class="primary-nav" aria-label="Primary navigation">
          ${renderNavLinks(currentRoute)}
        </nav>
        <div class="header-actions">
          <a class="btn btn-primary btn-sm" href="/estimate/">Get Automation Estimate</a>
          <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="mobile-nav" aria-label="Open navigation menu">Menu</button>
        </div>
      </div>
      <div id="mobile-nav" class="mobile-nav" data-mobile-nav aria-hidden="true" hidden>
        <nav aria-label="Mobile navigation">
          <ul>
            ${renderNavLinks(currentRoute, true)}
          </ul>
        </nav>
      </div>
    </header>
  `;
}

function renderFooter() {
  const contactLinks = [
    { label: "Email", url: emailProjectBriefHref() },
    { label: resumeLabel(), url: resumeHref() },
    { label: "LinkedIn", url: siteData.contact.linkedin },
    { label: "GitHub", url: siteData.contact.github }
  ].filter((item) => item.url);

  return `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div class="footer-brand-block">
          <p class="footer-title">${escapeHtml(siteData.site.name)}</p>
          <p class="footer-copy">${escapeHtml(siteData.site.tagline)}</p>
          <p class="footer-note">${escapeHtml(siteData.contact.responseTime)}</p>
          <div class="footer-links" aria-label="Footer contact links">
            ${contactLinks
              .map(
                (item) =>
                  `<a href="${escapeAttribute(item.url)}"${externalLinkAttributes(item.url)}>${escapeHtml(item.label)}</a>`
              )
              .join("")}
          </div>
        </div>
        <div class="footer-nav-block">
          <p class="footer-title">Explore</p>
          <nav class="footer-nav" aria-label="Footer explore">
            <ul class="footer-nav-list">
              ${renderFooterNavLinks()}
            </ul>
          </nav>
        </div>
      </div>
      <div class="container footer-bottom">
        <p>&copy; ${new Date(buildDate).getUTCFullYear()} ${escapeHtml(siteData.site.name)}. All rights reserved.</p>
        <p>Remote contract engineering for internal tools, automation systems, and Android + AI product delivery.</p>
      </div>
    </footer>
  `;
}

function renderDocument({
  title,
  description,
  route,
  body,
  jsonLd,
  ogType = "website",
  noIndex = false,
  injectHead = "",
  extraScripts = "",
  ogImage = `${siteUrl}/og-image.png`,
  ogImageAlt = `${siteData.site.name} portfolio preview`,
  ogImageWidth = 1200,
  ogImageHeight = 630
}) {
  const canonical = toAbsoluteUrl(route);
  const robots = noIndex ? "noindex, nofollow" : "index, follow";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="${escapeAttribute(siteData.site.themeColor || "#0a0f1e")}">
  <meta name="description" content="${escapeAttribute(description)}">
  <meta name="author" content="${escapeAttribute(siteData.site.name)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${escapeAttribute(canonical)}">
  <meta property="og:type" content="${escapeAttribute(ogType)}">
  <meta property="og:locale" content="en_US">
  <meta property="og:title" content="${escapeAttribute(title)}">
  <meta property="og:description" content="${escapeAttribute(description)}">
  <meta property="og:url" content="${escapeAttribute(canonical)}">
  <meta property="og:site_name" content="${escapeAttribute(siteData.site.name)}">
  <meta property="og:image" content="${escapeAttribute(ogImage)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="${escapeAttribute(ogImageWidth)}">
  <meta property="og:image:height" content="${escapeAttribute(ogImageHeight)}">
  <meta property="og:image:alt" content="${escapeAttribute(ogImageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${escapeAttribute(canonical)}">
  <meta name="twitter:title" content="${escapeAttribute(title)}">
  <meta name="twitter:description" content="${escapeAttribute(description)}">
  <meta name="twitter:image" content="${escapeAttribute(ogImage)}">
  <meta name="twitter:image:alt" content="${escapeAttribute(ogImageAlt)}">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16">
  <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="/favicon-192.png" sizes="192x192">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="stylesheet" href="/assets/css/site.min.css">
  ${renderJsonLd(jsonLd)}
  ${injectHead}
</head>
<body>
  ${renderHeader(route)}
  ${body}
  ${renderFooter()}
  <script src="/assets/js/site.js" defer></script>
  ${extraScripts}
</body>
</html>`;
}

function renderProofStrip(items) {
  return items
    .map(
      (item, index) => `
      <li class="proof-item" data-animate style="--delay:${animationDelay(index, 0.05)}">
        <span class="proof-index">${index + 1}</span>
        <p>${escapeHtml(item)}</p>
      </li>
    `
    )
    .join("");
}

function renderProofLinks(slugs, label = "Relevant proof") {
  const items = (slugs || []).map((slug) => findCaseStudy(slug)).filter(Boolean);
  if (items.length === 0) {
    return "";
  }

  return `
    <div class="proof-links-block">
      <p class="mini-label">${escapeHtml(label)}</p>
      <div class="inline-links">
        ${items
          .map((item) => `<a href="${escapeAttribute(item.route)}">${escapeHtml(item.title)}</a>`)
          .join("")}
      </div>
    </div>
  `;
}

function renderServiceCards(items, startingDelay = 0) {
  return items
    .map(
      (item, index) => `
      <article class="card service-card" data-animate style="--delay:${animationDelay(index, 0.05, startingDelay)}">
        <header class="service-header">
          <h3>${escapeHtml(item.name)}</h3>
          ${item.priceFrom ? `<p class="service-price"><strong>${escapeHtml(item.priceFrom)}</strong> &middot; fixed-scope</p>` : ""}
          <p class="service-summary">${escapeHtml(item.summary)}</p>
        </header>
        <p class="service-timeline">${escapeHtml(item.timeline)}</p>
        <p class="service-fit">${escapeHtml(item.bestFor)}</p>
        <ul class="list-dot">
          ${(item.deliverables || []).map((deliverable) => `<li>${escapeHtml(deliverable)}</li>`).join("")}
        </ul>
        ${renderProofLinks(item.proofSlugs)}
      </article>
    `
    )
    .join("");
}

function caseCategoryMark(category) {
  const normalized = String(category || "").toLowerCase();
  if (normalized.includes("android")) return "AA";
  if (normalized.includes("automation")) return "AU";
  if (normalized.includes("platform")) return "PF";
  if (normalized.includes("supporting")) return "SD";
  if (normalized.includes("client")) return "CL";

  const words = String(category || "")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("") || "CS";
}

function caseCoverConfig(caseStudy) {
  const configs = {
    "enterprise-crm-sales-pipeline-performance-system": {
      accent: "#56b7ff",
      background: "linear-gradient(145deg,#08172e 0%,#0d2847 55%,#091e38 100%)",
      tag: "Sales Pipeline & CRM",
      headline: "Pipeline clarity from lead to close",
      motif: `<svg class="cc-motif" width="80" height="56" viewBox="0 0 80 56" fill="none" aria-hidden="true"><rect x="1" y="1" width="20" height="7" rx="2" fill="white"/><rect x="1" y="12" width="20" height="7" rx="2" fill="white"/><rect x="1" y="23" width="20" height="7" rx="2" fill="white"/><rect x="1" y="34" width="20" height="7" rx="2" fill="white"/><rect x="30" y="1" width="20" height="7" rx="2" fill="white"/><rect x="30" y="12" width="20" height="7" rx="2" fill="white"/><rect x="30" y="23" width="20" height="7" rx="2" fill="white"/><rect x="59" y="1" width="20" height="7" rx="2" fill="white"/><rect x="59" y="12" width="20" height="7" rx="2" fill="white"/></svg>`
    },
    "automation-workflows-n8n-gas-api-integrations": {
      accent: "#5de6c6",
      background: "linear-gradient(145deg,#061e1a 0%,#0a2e27 55%,#071f1b 100%)",
      tag: "Order & Lead Ops",
      headline: "Manual ops replaced with zero-touch flow",
      motif: `<svg class="cc-motif" width="96" height="44" viewBox="0 0 96 44" fill="none" aria-hidden="true"><circle cx="10" cy="22" r="8" stroke="white" stroke-width="1.5"/><line x1="18" y1="22" x2="34" y2="22" stroke="white" stroke-width="1.5"/><polygon points="33,18 41,22 33,26" fill="white"/><rect x="41" y="12" width="20" height="20" rx="3" stroke="white" stroke-width="1.5"/><line x1="61" y1="22" x2="72" y2="12" stroke="white" stroke-width="1.5"/><line x1="61" y1="22" x2="72" y2="32" stroke="white" stroke-width="1.5"/><circle cx="80" cy="8" r="7" stroke="white" stroke-width="1.5"/><circle cx="80" cy="36" r="7" stroke="white" stroke-width="1.5"/></svg>`
    },
    "ai-content-research-script-automation": {
      accent: "#38bdf8",
      background: "linear-gradient(145deg,#061826 0%,#0a2b3f 55%,#071c2b 100%)",
      tag: "AI Research Workflow",
      headline: "Research, scripts, Docs, and Sheets in one flow",
      motif: `<svg class="cc-motif" width="78" height="56" viewBox="0 0 78 56" fill="none" aria-hidden="true"><rect x="2" y="4" width="26" height="40" rx="4" stroke="white" stroke-width="1.5"/><line x1="8" y1="14" x2="22" y2="14" stroke="white" stroke-width="1.4"/><line x1="8" y1="23" x2="22" y2="23" stroke="white" stroke-width="1.4"/><line x1="8" y1="32" x2="18" y2="32" stroke="white" stroke-width="1.4"/><path d="M31 24 H43" stroke="white" stroke-width="1.5"/><polygon points="42,20 50,24 42,28" fill="white"/><rect x="52" y="8" width="24" height="36" rx="4" stroke="white" stroke-width="1.5"/><line x1="58" y1="18" x2="70" y2="18" stroke="white" stroke-width="1.4"/><line x1="58" y1="27" x2="70" y2="27" stroke="white" stroke-width="1.4"/><line x1="58" y1="36" x2="66" y2="36" stroke="white" stroke-width="1.4"/></svg>`
    },
    "sp2dk-lhp2dk-whatsapp-reminder-system": {
      accent: "#34d399",
      background: "linear-gradient(145deg,#06180f 0%,#0b2d1d 55%,#071d13 100%)",
      tag: "Reminder Ops",
      headline: "Deadlines mapped into WhatsApp-ready follow-up",
      motif: `<svg class="cc-motif" width="76" height="56" viewBox="0 0 76 56" fill="none" aria-hidden="true"><rect x="3" y="6" width="34" height="40" rx="5" stroke="white" stroke-width="1.5"/><line x1="11" y1="17" x2="29" y2="17" stroke="white" stroke-width="1.4"/><line x1="11" y1="27" x2="29" y2="27" stroke="white" stroke-width="1.4"/><line x1="11" y1="37" x2="23" y2="37" stroke="white" stroke-width="1.4"/><path d="M42 29 C42 18 50 10 61 10 C69 10 74 16 74 24 C74 34 66 41 57 41 H50 L43 48 L45 39 C43 36 42 33 42 29 Z" stroke="white" stroke-width="1.5"/><circle cx="54" cy="26" r="1.8" fill="white"/><circle cx="62" cy="26" r="1.8" fill="white"/></svg>`
    },
    "media-app-android-ai-chat-search-ux": {
      accent: "#a78bfa",
      background: "linear-gradient(145deg,#110e28 0%,#1a1340 55%,#130f2c 100%)",
      tag: "AI Chat + Search",
      headline: "AI chat and search shipped into production",
      motif: `<svg class="cc-motif" width="76" height="54" viewBox="0 0 76 54" fill="none" aria-hidden="true"><rect x="0" y="0" width="50" height="20" rx="10" fill="white"/><polygon points="6,20 2,30 18,20" fill="white"/><rect x="26" y="26" width="50" height="20" rx="10" fill="white"/><polygon points="70,46 74,52 58,46" fill="white"/></svg>`
    },
    "multi-surface-monorepo-nextjs-nestjs-platform": {
      accent: "#fb923c",
      background: "linear-gradient(145deg,#1a0e04 0%,#2a1a08 55%,#1c1005 100%)",
      tag: "Multi-Surface Platform",
      headline: "Web, mobile, and API from a single repo",
      motif: `<svg class="cc-motif" width="80" height="56" viewBox="0 0 80 56" fill="none" aria-hidden="true"><rect x="28" y="0" width="24" height="14" rx="3" stroke="white" stroke-width="1.5"/><line x1="40" y1="14" x2="40" y2="22" stroke="white" stroke-width="1.5"/><line x1="14" y1="22" x2="66" y2="22" stroke="white" stroke-width="1.5"/><line x1="14" y1="22" x2="14" y2="28" stroke="white" stroke-width="1.5"/><line x1="40" y1="22" x2="40" y2="28" stroke="white" stroke-width="1.5"/><line x1="66" y1="22" x2="66" y2="28" stroke="white" stroke-width="1.5"/><rect x="2" y="28" width="24" height="14" rx="3" stroke="white" stroke-width="1.5"/><rect x="28" y="28" width="24" height="14" rx="3" stroke="white" stroke-width="1.5"/><rect x="54" y="28" width="24" height="14" rx="3" stroke="white" stroke-width="1.5"/><line x1="14" y1="42" x2="14" y2="46" stroke="white" stroke-width="1.5"/><line x1="6" y1="46" x2="22" y2="46" stroke="white" stroke-width="1.5"/><line x1="6" y1="46" x2="6" y2="52" stroke="white" stroke-width="1.5"/><line x1="22" y1="46" x2="22" y2="52" stroke="white" stroke-width="1.5"/></svg>`
    },
    "social-feed-ui-fixes-cards-polish": {
      accent: "#f472b6",
      background: "linear-gradient(145deg,#1e0c17 0%,#2e1222 55%,#200e19 100%)",
      tag: "Feed UI & Cards",
      headline: "Feed cards fixed, zero regressions shipped",
      motif: `<svg class="cc-motif" width="64" height="56" viewBox="0 0 64 56" fill="none" aria-hidden="true"><rect x="8" y="0" width="56" height="14" rx="4" stroke="white" stroke-width="1.5"/><line x1="16" y1="7" x2="52" y2="7" stroke="white" stroke-width="1"/><rect x="4" y="20" width="56" height="14" rx="4" stroke="white" stroke-width="1.5"/><line x1="12" y1="27" x2="48" y2="27" stroke="white" stroke-width="1"/><rect x="0" y="40" width="56" height="14" rx="4" stroke="white" stroke-width="1.5"/><line x1="8" y1="47" x2="44" y2="47" stroke="white" stroke-width="1"/></svg>`
    },
    "spectre-insight-ai-spreadsheet-brief": {
      accent: "#fbbf24",
      background: "linear-gradient(145deg,#1a1208 0%,#291d0d 55%,#1c1409 100%)",
      tag: "Personal Product · Live",
      headline: "Spreadsheets in. Management briefs out.",
      motif: `<svg class="cc-motif" width="84" height="56" viewBox="0 0 84 56" fill="none" aria-hidden="true"><rect x="0" y="2" width="32" height="52" rx="3" stroke="white" stroke-width="1.5"/><line x1="0" y1="14" x2="32" y2="14" stroke="white" stroke-width="1"/><line x1="11" y1="2" x2="11" y2="54" stroke="white" stroke-width="1"/><line x1="22" y1="2" x2="22" y2="54" stroke="white" stroke-width="1"/><line x1="0" y1="26" x2="32" y2="26" stroke="white" stroke-width="1"/><line x1="0" y1="38" x2="32" y2="38" stroke="white" stroke-width="1"/><path d="M38 28 L48 28" stroke="white" stroke-width="1.5"/><polygon points="46,24 52,28 46,32" fill="white"/><rect x="56" y="2" width="28" height="52" rx="3" stroke="white" stroke-width="1.5"/><line x1="60" y1="12" x2="80" y2="12" stroke="white" stroke-width="1.5"/><line x1="60" y1="20" x2="76" y2="20" stroke="white" stroke-width="1"/><line x1="60" y1="28" x2="80" y2="28" stroke="white" stroke-width="1"/><line x1="60" y1="36" x2="74" y2="36" stroke="white" stroke-width="1"/><line x1="60" y1="44" x2="78" y2="44" stroke="white" stroke-width="1"/></svg>`
    },
    "offscan-ai-offline-ocr-android": {
      accent: "#22d3ee",
      background: "linear-gradient(145deg,#041921 0%,#07293a 55%,#051d27 100%)",
      tag: "Offline OCR Engine",
      headline: "OCR that works with no signal, no cloud",
      motif: `<svg class="cc-motif" width="60" height="60" viewBox="0 0 60 60" fill="none" aria-hidden="true"><path d="M4 0 L40 0 L56 16 L56 60 L4 60 Z" stroke="white" stroke-width="1.5" fill="none"/><path d="M40 0 L40 16 L56 16" stroke="white" stroke-width="1.5" fill="none"/><line x1="12" y1="26" x2="48" y2="26" stroke="white" stroke-width="1"/><line x1="12" y1="34" x2="48" y2="34" stroke="white" stroke-width="2"/><line x1="12" y1="42" x2="48" y2="42" stroke="white" stroke-width="1"/></svg>`
    },
    "i-scantea-edge-ml-grading-prototype": {
      accent: "#4ade80",
      background: "linear-gradient(145deg,#061508 0%,#0d2410 55%,#081709 100%)",
      tag: "Edge ML Classifier",
      headline: "Field-grade ML classifier running on-device",
      motif: `<svg class="cc-motif" width="72" height="52" viewBox="0 0 72 52" fill="none" aria-hidden="true"><rect x="0" y="4" width="58" height="8" rx="3" fill="white"/><rect x="0" y="18" width="42" height="8" rx="3" fill="white"/><rect x="0" y="32" width="52" height="8" rx="3" fill="white"/><rect x="0" y="46" width="28" height="8" rx="3" fill="white"/><line x1="60" y1="8" x2="72" y2="8" stroke="white" stroke-width="1.5"/><line x1="44" y1="22" x2="72" y2="22" stroke="white" stroke-width="1.5"/><line x1="54" y1="36" x2="72" y2="36" stroke="white" stroke-width="1.5"/><line x1="30" y1="50" x2="72" y2="50" stroke="white" stroke-width="1.5"/></svg>`
    },
    "scanberry-mobile-vision-prototype": {
      accent: "#c084fc",
      background: "linear-gradient(145deg,#140a22 0%,#1f1036 55%,#170c27 100%)",
      tag: "Mobile Vision Scan",
      headline: "Offline-first scan and classify, no network needed",
      motif: `<svg class="cc-motif" width="64" height="56" viewBox="0 0 64 56" fill="none" aria-hidden="true"><path d="M4 16 L4 4 L16 4" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M48 4 L60 4 L60 16" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M4 40 L4 52 L16 52" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M48 52 L60 52 L60 40" stroke="white" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="28" r="8" stroke="white" stroke-width="1.5"/><line x1="32" y1="16" x2="32" y2="22" stroke="white" stroke-width="1.5"/><line x1="32" y1="34" x2="32" y2="40" stroke="white" stroke-width="1.5"/><line x1="20" y1="28" x2="26" y2="28" stroke="white" stroke-width="1.5"/><line x1="38" y1="28" x2="44" y2="28" stroke="white" stroke-width="1.5"/></svg>`
    }
  };

  return configs[caseStudy.slug] || {
    accent: "#8fd1ff",
    background: "linear-gradient(145deg,#081120 0%,#0d1830 55%,#121f3f 100%)",
    tag: caseStudy.category || "Case Study",
    headline: caseStudy.outcome || caseStudy.shortSummary,
    motif: ""
  };
}

function timelineBadge(timeline) {
  const match = String(timeline || "").match(/(\d+)-week/i);
  return match ? `${match[1]} wks` : "Delivery";
}

function renderCaseVisual(caseStudy, loading = "lazy") {
  void loading;
  const config = caseCoverConfig(caseStudy);
  const stackLine = (caseStudy.techStack || []).slice(0, 3).join(" | ");

  return `
    <div class="case-cover-styled" style="--cc-accent:${escapeAttribute(config.accent)};background:${escapeAttribute(config.background)}" aria-hidden="true">
      <div class="cc-top">
        <span class="cc-category-tag">${escapeHtml(config.tag)}</span>
        <span class="cc-duration">${escapeHtml(timelineBadge(caseStudy.timeline))}</span>
      </div>
      <div class="cc-body">
        <div class="cc-accent-bar"></div>
        <p class="cc-headline">${escapeHtml(config.headline)}</p>
        <p class="cc-stack-line">${escapeHtml(stackLine)}</p>
      </div>
      ${config.motif}
    </div>
  `;
}

function renderCaseCategoryVisual(caseStudy) {
  return `
    <div class="case-category-visual" aria-hidden="true">
      <span class="case-category-chip">${escapeHtml(caseStudy.category)}</span>
      <span class="case-category-mark">${escapeHtml(caseCategoryMark(caseStudy.category))}</span>
    </div>
  `;
}

function renderCaseCard(caseStudy, index, options = {}) {
  const { showVisual = true, compact = false } = options;
  const problemLine = caseStudy.problem || caseStudy.shortSummary;
  const approachLine = (caseStudy.approach || [])[0] || caseStudy.shortSummary;
  const resultLine = caseStudy.outcome || (caseStudy.results || [])[0] || caseStudy.shortSummary;
  const proofLabel = caseStudy.type === "client" ? "Client delivery" : "Public build";
  const proofClass = caseStudy.type === "client" ? "case-proof-nda" : "case-proof-nda case-proof-public";
  const topStack = (caseStudy.techStack || []).slice(0, compact ? 3 : 5);

  return `
    <article class="card case-card${compact ? " case-card-compact" : ""}" data-animate style="--delay:${animationDelay(index, 0.04)}">
      ${showVisual ? `<div class="case-cover">${renderCaseVisual(caseStudy)}</div>` : renderCaseCategoryVisual(caseStudy)}
      <div class="case-content">
        <div class="case-topline">
          <p class="case-kicker">${escapeHtml(caseStudy.category)}</p>
          <p class="${proofClass}">${escapeHtml(proofLabel)}</p>
        </div>
        <h3 class="line-clamp line-clamp-2">${escapeHtml(caseStudy.title)}</h3>
        <p class="case-role">${escapeHtml(caseStudy.role)}<span aria-hidden="true"> | </span>${escapeHtml(caseStudy.timeline)}</p>
        <p class="case-outcome">${escapeHtml(caseStudy.outcome || caseStudy.shortSummary)}</p>
        <ul class="case-summary">
          <li><span class="case-summary-label">Problem</span><p class="line-clamp line-clamp-2">${escapeHtml(problemLine)}</p></li>
          <li><span class="case-summary-label">My scope</span><p class="line-clamp line-clamp-2">${escapeHtml(approachLine)}</p></li>
          <li><span class="case-summary-label">Result</span><p class="line-clamp line-clamp-2">${escapeHtml(resultLine)}</p></li>
        </ul>
        <ul class="stack-list">
          ${topStack.map((tech) => `<li>${escapeHtml(tech)}</li>`).join("")}
        </ul>
        <a class="btn btn-secondary btn-read" href="${escapeAttribute(caseStudy.route)}">Read case study</a>
      </div>
    </article>
  `;
}

function renderRelatedCaseCards(caseStudy) {
  const relatedCases = resolveRelatedCases(caseStudy);
  if (relatedCases.length === 0) {
    return "";
  }

  return `
    <section class="section" aria-labelledby="related-work-heading">
      <div class="container">
        <div class="section-head">
          <h2 id="related-work-heading">More relevant work</h2>
          <p>Related delivery proof across internal tools, automation, Android + AI, and supporting product systems.</p>
        </div>
        <div class="grid case-grid">
          ${relatedCases.map((item, index) => renderCaseCard(item, index, { showVisual: false, compact: true })).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderCaseTestimonial(caseStudy) {
  const testimonial = caseStudy.testimonial;
  if (!testimonial?.quote) {
    return "";
  }

  const attribution = [testimonial.name, testimonial.context].filter(Boolean).join(" — ");

  return `
            <section class="case-testimonial-section">
              <h2>Client proof</h2>
              <blockquote class="case-testimonial">
                <p>${escapeHtml(testimonial.quote)}</p>
                ${attribution ? `<footer>${escapeHtml(attribution)}</footer>` : ""}
                ${testimonial.note ? `<span>${escapeHtml(testimonial.note)}</span>` : ""}
              </blockquote>
            </section>
  `;
}

function renderContactChannels() {
  const links = [
    { label: `Email (${siteData.contact.email})`, href: emailProjectBriefHref() },
    { label: resumeLabel(), href: resumeHref() },
    { label: "LinkedIn", href: siteData.contact.linkedin },
    { label: "GitHub", href: siteData.contact.github }
  ].filter((item) => item.href);

  if (siteData.contact.whatsapp) {
    links.splice(1, 0, { label: "WhatsApp", href: siteData.contact.whatsapp });
  }

  return `
    <ul class="contact-list">
      ${links
        .map((item) => `<li><a href="${escapeAttribute(item.href)}"${externalLinkAttributes(item.href)}>${escapeHtml(item.label)}</a></li>`)
        .join("")}
    </ul>
  `;
}

function renderProcessCards(items) {
  return (items || [])
    .map(
      (item, index) => `
      <li class="card" data-animate style="--delay:${animationDelay(index, 0.05)}">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </li>
    `
    )
    .join("");
}

function renderFaqCards(items) {
  return (items || [])
    .map(
      (item, index) => `
      <article class="card faq-card" data-animate style="--delay:${animationDelay(index, 0.05)}">
        <h3>${escapeHtml(item.question)}</h3>
        <p>${escapeHtml(item.answer)}</p>
      </article>
    `
    )
    .join("");
}

function renderProfileLinks() {
  return (siteData.trust?.profiles || [])
    .map(
      (item) =>
        `<a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`
    )
    .join("");
}

function renderCredentialLinks() {
  const credentials = (siteData.trust?.credentials || []).filter((item) => item.label && item.url);
  if (credentials.length === 0) {
    return "";
  }

  return `
    <h3 class="links-title">Verified credentials</h3>
    <div class="profile-links credential-links">
      ${credentials
        .map(
          (item) =>
            `<a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer"${item.detail ? ` title="${escapeAttribute(item.detail)}"` : ""}>${escapeHtml(item.label)}</a>`
        )
        .join("")}
    </div>
  `;
}

function renderTestimonials() {
  const testimonials = siteData.testimonials || [];
  if (testimonials.length === 0) {
    return "";
  }

  return `
      <section class="section" aria-labelledby="testimonials-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="testimonials-heading">What clients say</h2>
            <p>Verified delivery across CRM, automation, and internal tooling projects. Repeat-client context available on call.</p>
          </div>
          <div class="testimonials-grid">
            ${testimonials
              .map(
                (item, index) => `
            <div class="testimonial-card" data-animate style="--delay:${animationDelay(index, 0.05)}">
              <div class="testimonial-body">
                ${item.translationLabel ? `<p class="testimonial-label">${escapeHtml(item.translationLabel)}</p>` : ""}
                <p class="testimonial-quote">${escapeHtml(item.quote)}</p>
              </div>
              <div class="testimonial-attr">
                <p class="testimonial-client">${escapeHtml(item.clientName)}</p>
                <p class="testimonial-context">${escapeHtml(item.clientContext)}</p>
                <p class="testimonial-meta">${escapeHtml(item.meta)}</p>
              </div>
            </div>
          `
              )
              .join("")}
          </div>
        </div>
      </section>
  `;
}

function requiredMark(required = true) {
  return required ? ` <span aria-hidden="true">*</span>` : "";
}

function renderEstimateOptionContent(option, extraAttributes = "") {
  return `
            <span class="estimate-option-copy"${extraAttributes}>
              <span class="estimate-option-label">${escapeHtml(option.label)}</span>
              ${option.helper ? `<small>${escapeHtml(option.helper)}</small>` : ""}
            </span>`;
}

function renderEstimateRadioGroup({ name, label, options, columns = "", required = true, helper = "" }) {
  return `
    <fieldset class="estimate-fieldset">
      <legend>${escapeHtml(label)}${requiredMark(required)}</legend>
      ${helper ? `<p class="estimate-helper">${escapeHtml(helper)}</p>` : ""}
      <div class="estimate-options${columns ? ` ${escapeAttribute(columns)}` : ""}">
        ${options
          .map(
            (option) => `
          <label class="estimate-option">
            <input type="radio" name="${escapeAttribute(name)}" value="${escapeAttribute(option.value)}"${required ? " required" : ""}>
${renderEstimateOptionContent(option)}
          </label>
        `
          )
          .join("")}
      </div>
    </fieldset>
  `;
}

function renderEstimateCheckboxGroup({ name, label, options, columns = "", required = true, helper = "" }) {
  return `
    <fieldset class="estimate-fieldset"${required ? ` data-required-checkbox-group="${escapeAttribute(name)}"` : ""}>
      <legend>${escapeHtml(label)}${requiredMark(required)}</legend>
      ${helper ? `<p class="estimate-helper">${escapeHtml(helper)}</p>` : ""}
      <div class="estimate-options estimate-options-check${columns ? ` ${escapeAttribute(columns)}` : ""}">
        ${options
          .map(
            (option) => `
          <label class="estimate-option">
            <input type="checkbox" name="${escapeAttribute(name)}" value="${escapeAttribute(option.value)}">
${renderEstimateOptionContent(option)}
          </label>
        `
          )
          .join("")}
      </div>
    </fieldset>
  `;
}

function renderEstimateSelect({ name, label, options, required = true, helper = "" }) {
  return `
    <label class="estimate-field">
      <span>${escapeHtml(label)}${requiredMark(required)}</span>
      ${helper ? `<small class="estimate-helper">${escapeHtml(helper)}</small>` : ""}
      <select name="${escapeAttribute(name)}"${required ? " required" : ""}>
        <option value="">Select one</option>
        ${options.map((option) => `<option value="${escapeAttribute(option.value)}">${escapeHtml(option.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderEstimateBudgetOptions(question) {
  return `
    <fieldset class="estimate-fieldset">
      <legend>${escapeHtml(question.label)}${requiredMark(question.required)}</legend>
      ${question.helper ? `<p class="estimate-helper">${escapeHtml(question.helper)}</p>` : ""}
      <div class="estimate-options${question.columns ? ` ${escapeAttribute(question.columns)}` : ""}">
        ${(question.options || [])
          .map(
            (option) => `
          <label class="estimate-option">
            <input type="radio" name="${escapeAttribute(question.name)}" value="${escapeAttribute(option.value)}"${question.required ? " required" : ""}>
${renderEstimateOptionContent(
  option,
  ` data-budget-label data-idr="${escapeAttribute(option.idrLabel || option.label)}" data-usd="${escapeAttribute(option.usdLabel || option.label)}"`
)}
          </label>
        `
          )
          .join("")}
      </div>
    </fieldset>
  `;
}

function renderEstimateTextarea({ name, label, placeholder = "", required = true, rows = 5, helper = "" }) {
  return `
    <label class="estimate-field estimate-field-wide">
      <span>${escapeHtml(label)}${requiredMark(required)}</span>
      ${helper ? `<small class="estimate-helper">${escapeHtml(helper)}</small>` : ""}
      <textarea name="${escapeAttribute(name)}" rows="${escapeAttribute(rows)}"${required ? " required" : ""}${placeholder ? ` placeholder="${escapeAttribute(placeholder)}"` : ""}></textarea>
    </label>
  `;
}

function renderEstimateQuestion(question) {
  if (question.type === "select") return renderEstimateSelect(question);
  if (question.type === "checkbox") return renderEstimateCheckboxGroup(question);
  if (question.type === "textarea") return renderEstimateTextarea(question);
  if (question.name === "budgetReadiness") return renderEstimateBudgetOptions(question);
  return renderEstimateRadioGroup(question);
}

function renderEstimateFormSections() {
  return (estimateData.form?.sections || [])
    .map(
      (section, index) => `
        <section class="estimate-form-section" data-estimate-step="${index}" data-estimate-step-title="${escapeAttribute(section.heading)}" aria-labelledby="estimate-section-${escapeAttribute(section.id)}"${index > 0 ? " hidden" : ""}>
          <div class="estimate-section-head">
            ${section.eyebrow ? `<p class="mini-label">${escapeHtml(section.eyebrow)}</p>` : ""}
            <h3 id="estimate-section-${escapeAttribute(section.id)}">${escapeHtml(section.heading)}</h3>
            ${section.lead ? `<p>${escapeHtml(section.lead)}</p>` : ""}
          </div>
          ${(section.questions || []).map((question) => renderEstimateQuestion(question)).join("")}
        </section>
      `
    )
    .join("");
}

function renderEstimateContactFields() {
  return (estimateData.contact?.fields || [])
    .map(
      (field) => `
        <label class="estimate-field">
          <span>${escapeHtml(field.label)}${requiredMark(field.required)}</span>
          <input type="${escapeAttribute(field.type || "text")}" name="${escapeAttribute(field.name)}"${field.autocomplete ? ` autocomplete="${escapeAttribute(field.autocomplete)}"` : ""}${field.type === "email" ? ' inputmode="email"' : ""}${field.required ? " required" : ""}>
        </label>
      `
    )
    .join("");
}

function renderEstimateProofStrip() {
  const proof = estimateData.proof || {};
  const proofItems = proof.items || [];

  return `
    <section class="section section-tight estimate-proof-section" aria-labelledby="estimate-proof-heading">
      <div class="container">
        <div class="section-head">
          <h2 id="estimate-proof-heading">${escapeHtml(proof.heading || "Relevant delivery proof")}</h2>
          <p>${escapeHtml(proof.description || "")}</p>
        </div>
        <ul class="estimate-proof-strip">
          ${proofItems
            .map(
              (item, index) => `
          <li data-animate style="--delay:${animationDelay(index, 0.04)}">
            <a href="${escapeAttribute(item.href)}" data-estimate-proof-link>
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.outcome || item.detail || "")}</span>
            </a>
          </li>
        `
            )
            .join("")}
        </ul>
      </div>
    </section>
  `;
}

function renderEstimateSummaryPanel() {
  const sidePanel = estimateData.sidePanel || {};

  return `
          <aside class="estimate-side" aria-label="Pre-audit summary" data-estimate-summary-panel>
            <p class="eyebrow">${escapeHtml(sidePanel.eyebrow || "Pre-audit summary")}</p>
            <dl class="estimate-summary-list">
              <div>
                <dt>Business context</dt>
                <dd data-summary="context">${escapeHtml(sidePanel.contextPlaceholder || "Business context will appear here.")}</dd>
              </div>
              <div>
                <dt>Selected bottlenecks</dt>
                <dd data-summary="bottlenecks">${escapeHtml(sidePanel.bottleneckPlaceholder || "Selected workflows will appear here.")}</dd>
              </div>
              <div>
                <dt>Complexity signals</dt>
                <dd data-summary="complexity">${escapeHtml(sidePanel.complexityPlaceholder || "Complexity signals will update as you answer.")}</dd>
              </div>
              <div>
                <dt>Planning path preview</dt>
                <dd data-summary="path">${escapeHtml(sidePanel.pathPlaceholder || "Potential package direction will appear after the main signals.")}</dd>
              </div>
            </dl>
            <div class="estimate-next-note">
              <p class="mini-label">${escapeHtml(sidePanel.nextHeading || "What happens next")}</p>
              <p>${escapeHtml(
                sidePanel.nextDetail ||
                  "Review the planning range, then send the summary with your contact details if the direction feels useful."
              )}</p>
            </div>
          </aside>
  `;
}

function renderEstimateConfigScript() {
  const config = {
    webhookEndpoint: estimateWebhookEndpoint,
    contactEmail: estimateData.fallbackEmail || siteData.contact.email,
    source: "portfolio_estimate"
  };
  const safeJson = JSON.stringify(config).replace(/</g, "\\u003c");
  return `<script type="application/json" id="estimate-config">${safeJson}</script>`;
}

function renderEstimateDataScript() {
  const clientData = {
    pricing: estimateData.pricing,
    questions: estimateData.form?.sections || [],
    contact: estimateData.contact || {},
    result: estimateData.result || {},
    sidePanel: estimateData.sidePanel || {},
    disclaimer: estimateData.disclaimer,
    scoring: estimateData.scoring || {},
    analytics: estimateData.analytics || {}
  };
  const safeJson = JSON.stringify(clientData).replace(/</g, "\\u003c");
  return `<script type="application/json" id="estimate-data">${safeJson}</script>`;
}

function estimatePage() {
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: estimateData.hero?.headline,
    url: toAbsoluteUrl("/estimate/"),
    description: estimateData.seo?.description,
    isPartOf: toAbsoluteUrl("/")
  };

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Automation system estimate",
    provider: {
      "@type": "Person",
      name: siteData.site.name,
      url: toAbsoluteUrl("/")
    },
    serviceType: "Automation, CRM, dashboard, AI, Android, and internal tooling delivery",
    areaServed: ["Indonesia", "Remote"]
  };
  const result = estimateData.result || {};
  const contact = estimateData.contact || {};
  const primaryCta = estimateData.hero?.primaryCta || "Get Automation Estimate";
  const secondaryCta = estimateData.hero?.secondaryCta || "Review relevant work";

  const body = `
    <main id="main-content" tabindex="-1" data-estimate-page>
      <section class="page-hero section estimate-hero">
        <div class="container">
          <p class="eyebrow" data-animate>${escapeHtml(estimateData.hero?.eyebrow || "Automation project estimator")}</p>
          <h1 data-animate style="--delay:0.04s">${escapeHtml(estimateData.hero?.headline || "Estimate Your Automation System")}</h1>
          <p data-animate style="--delay:0.08s">${escapeHtml(estimateData.hero?.subheadline || "")}</p>
          <div class="actions" data-animate style="--delay:0.12s">
            <a class="btn btn-primary" href="#estimate-form-heading">${escapeHtml(primaryCta)}</a>
            <a class="btn btn-secondary" href="/work/">${escapeHtml(secondaryCta)}</a>
          </div>
        </div>
      </section>

      <section class="section section-tight estimate-section" aria-labelledby="estimate-form-heading">
        <div class="container estimate-shell">
          <div class="estimate-main">
            <form id="automation-estimate-form" class="estimate-form" data-estimate-form novalidate>
              <div class="estimate-form-head">
                <p class="eyebrow">${escapeHtml(estimateData.form?.eyebrow || "Pre-audit intake")}</p>
                <h2 id="estimate-form-heading">${escapeHtml(estimateData.form?.heading || "Project details")}</h2>
                ${estimateData.form?.lead ? `<p>${escapeHtml(estimateData.form.lead)}</p>` : ""}
              </div>

              <div class="estimate-progress" aria-label="Pre-audit progress">
                <div class="estimate-progress-text">
                  <span data-estimate-progress-label>Step 1 of ${(estimateData.form?.sections || []).length}</span>
                  <strong data-estimate-progress-title>${escapeHtml(estimateData.form?.sections?.[0]?.heading || "")}</strong>
                </div>
                <div class="estimate-progress-track" aria-hidden="true">
                  <span data-estimate-progress-bar></span>
                </div>
              </div>

              ${renderEstimateFormSections()}

              <label class="estimate-honeypot" aria-hidden="true">
                <span>Website</span>
                <input type="text" name="website" tabindex="-1" autocomplete="off">
              </label>

              <div class="estimate-error" data-estimate-error role="alert" hidden></div>
              <div class="estimate-step-nav" aria-label="Pre-audit navigation">
                <button class="btn btn-secondary" type="button" data-estimate-prev>Back</button>
                <button class="btn btn-primary" type="button" data-estimate-next>Next</button>
                <button class="btn btn-primary" type="submit" data-estimate-show-result hidden>${escapeHtml(
                  estimateData.form?.submitLabel || "Show My Estimate"
                )}</button>
              </div>
            </form>

            <section class="estimate-result-section" data-estimate-result-section hidden aria-labelledby="estimate-result-heading">
              <article class="estimate-result-card" data-estimate-result-card aria-live="polite">
                <div class="estimate-result-head">
                  <p class="mini-label">Step 5 of 6</p>
                  <p class="eyebrow">${escapeHtml(result.eyebrow || "Pre-audit summary")}</p>
                  <h2 id="estimate-result-heading">${escapeHtml(result.heading || "Recommended implementation path")}</h2>
                </div>
                <dl class="estimate-result-grid">
                  <div>
                    <dt>${escapeHtml(result.labels?.package || "Recommended implementation path")}</dt>
                    <dd data-result="package">-</dd>
                  </div>
                  <div>
                    <dt>${escapeHtml(result.labels?.range || "Planning range")}</dt>
                    <dd data-result="range">-</dd>
                  </div>
                  <div>
                    <dt>${escapeHtml(result.labels?.timeline || "Likely delivery window")}</dt>
                    <dd data-result="timeline">-</dd>
                  </div>
                  <div>
                    <dt>${escapeHtml(result.labels?.complexity || "Complexity")}</dt>
                    <dd data-result="complexity">-</dd>
                  </div>
                </dl>
                <div class="estimate-why">
                  <p class="mini-label">${escapeHtml(result.whyLabel || "Why this path")}</p>
                  <p data-result="explanation"></p>
                </div>
                <p class="estimate-disclaimer">${escapeHtml(estimateData.disclaimer)}</p>
                <div class="estimate-payload-preview" data-estimate-payload-preview></div>
                <form class="estimate-contact-form" data-estimate-contact-form novalidate>
                  <div class="estimate-form-head">
                    <p class="mini-label">Step 6 of 6</p>
                    <p class="eyebrow">${escapeHtml(contact.eyebrow || "Send the summary")}</p>
                    <h3>${escapeHtml(contact.heading || "Send this estimate to Rifki")}</h3>
                    ${contact.lead ? `<p>${escapeHtml(contact.lead)}</p>` : ""}
                  </div>
                  <div class="estimate-field-grid">
                    ${renderEstimateContactFields()}
                  </div>
                </form>
                <div class="estimate-error" data-estimate-submit-status role="status" aria-live="polite" hidden></div>
                <div class="actions">
                  <button class="btn btn-primary" type="button" data-estimate-submit>${escapeHtml(contact.submitLabel || "Send My Estimate to Rifki")}</button>
                  <button class="btn btn-secondary" type="button" data-estimate-edit>${escapeHtml(contact.editLabel || "Edit answers")}</button>
                  <a class="btn btn-secondary" href="${escapeAttribute(estimateMailHref())}" data-estimate-mailto>${escapeHtml(contact.emailFallbackLabel || "Email Project Brief")}</a>
                </div>
              </article>
            </section>
          </div>

${renderEstimateSummaryPanel()}
        </div>
      </section>

      ${renderEstimateProofStrip()}
    </main>
  `;

  return {
    route: "/estimate/",
    filePath: path.join("estimate", "index.html"),
    title: estimateData.seo?.title,
    description: estimateData.seo?.description,
    body,
    jsonLd: [webPageJsonLd, serviceJsonLd],
    extraScripts: `${renderEstimateConfigScript()}\n  ${renderEstimateDataScript()}\n  <script src="/assets/js/estimate.js" defer></script>`
  };
}

function homePage() {
  const featuredCases = (siteData.featuredCaseSlugs || [])
    .map((slug) => findCaseStudy(slug))
    .filter(Boolean)
    .slice(0, 4);

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteData.site.name,
    url: toAbsoluteUrl("/"),
    description: siteData.site.tagline,
    inLanguage: "en-US"
  };

  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: siteData.site.name,
    url: toAbsoluteUrl("/"),
    jobTitle: siteData.site.title,
    email: `mailto:${siteData.contact.email}`,
    sameAs: [siteData.contact.linkedin, siteData.contact.github].filter(Boolean),
    knowsAbout: siteData.site.keywords
  };

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Remote contract engineering for AI-enabled workflows and product systems",
    provider: {
      "@type": "Person",
      name: siteData.site.name,
      url: toAbsoluteUrl("/")
    },
    serviceType: "Software engineering",
    areaServed: "Remote",
    description: siteData.site.tagline
  };

  const body = `
    <main id="main-content" tabindex="-1">
      <section class="hero section">
        <div class="container hero-grid">
          <div class="hero-main" data-animate>
            <p class="eyebrow">${escapeHtml(siteData.site.heroEyebrow)}</p>
            <h1>${escapeHtml(siteData.site.heroHeadline)}</h1>
            <p class="lead">${escapeHtml(siteData.site.heroSubheadline)}</p>
            <div class="actions">
              <a class="btn btn-primary" href="${escapeAttribute(siteData.site.heroPrimaryCta.href)}">${escapeHtml(siteData.site.heroPrimaryCta.label)}</a>
              <a class="btn btn-secondary" href="${escapeAttribute(siteData.site.heroSecondaryCta.href)}">${escapeHtml(siteData.site.heroSecondaryCta.label)}</a>
            </div>
          </div>
          <aside class="hero-panel" data-animate style="--delay:0.08s" aria-label="Positioning and proof summary">
            <div class="profile-photo-wrap">
              <picture>
                <source srcset="/assets/images/profile.webp" type="image/webp">
                <img class="profile-photo" src="/assets/images/profile.jpg" alt="${escapeAttribute(siteData.site.name)}" width="96" height="96" loading="eager" decoding="async">
              </picture>
            </div>
            <div class="avail-badge"><span class="avail-dot" aria-hidden="true"></span>${escapeHtml(siteData.site.heroAvailability || "Open to new projects")}</div>
            <p class="eyebrow eyebrow-muted" style="margin-top:0.9rem">Primary focus</p>
            <h2>${escapeHtml(siteData.site.heroPanelHeadline || "Internal tools, automation, and reliable remote delivery")}</h2>
            <ul class="list-dot list-dot-tight">
              ${(siteData.site.heroPanelBullets || [
                "Best fit for workflow-heavy teams that need clearer operating systems.",
                "Android + AI stays visible as a secondary specialization, not the whole story.",
                "Replies within 24 hours on weekdays."
              ]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </aside>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="estimate-home-heading">
        <div class="container cta-panel" data-animate>
          <p class="eyebrow">Pre-audit estimator</p>
          <h2 id="estimate-home-heading">Get a fast budget range before writing a long brief.</h2>
          <p>Answer a few workflow questions and get an estimated implementation path for automation, CRM, dashboards, Android + AI, or internal tooling work.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/estimate/">Get Automation Estimate</a>
            <a class="btn btn-secondary" href="/hire/">See engagement options</a>
          </div>
        </div>
      </section>

      ${siteData.site.homeVideo && siteData.site.homeVideo.loomId ? `
      <section class="section section-tight" aria-labelledby="walkthrough-heading">
        <div class="container">
          <div class="section-head" data-animate>
            ${siteData.site.homeVideo.eyebrow ? `<p class="eyebrow">${escapeHtml(siteData.site.homeVideo.eyebrow)}</p>` : ""}
            <h2 id="walkthrough-heading">${escapeHtml(siteData.site.homeVideo.title || "Walkthrough")}</h2>
            ${siteData.site.homeVideo.lead ? `<p>${escapeHtml(siteData.site.homeVideo.lead)}</p>` : ""}
          </div>
          <div class="video-frame" data-animate style="--delay:0.06s">
            <iframe
              src="https://www.loom.com/embed/${escapeAttribute(siteData.site.homeVideo.loomId)}"
              title="${escapeAttribute(siteData.site.homeVideo.title || "Walkthrough video")}"
              frameborder="0"
              webkitallowfullscreen
              mozallowfullscreen
              allowfullscreen
              loading="lazy"
            ></iframe>
          </div>
        </div>
      </section>
      ` : ""}

      <section class="section section-tight" aria-labelledby="proof-heading">
        <div class="container panel panel-highlight">
          <div class="section-head">
            <h2 id="proof-heading">Commercial proof</h2>
            <p>CRM, automation, Android AI UX, and multi-surface delivery kept at the center of the portfolio.</p>
          </div>
          <ul class="proof-strip">
            ${renderProofStrip(siteData.proofStrip || [])}
          </ul>
        </div>
      </section>

      <section class="section" aria-labelledby="services-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="services-heading">How I help</h2>
            <p>Outcome-first engagement options for teams that need delivery, not generic freelance coverage.</p>
          </div>
          <div class="grid grid-3">
            ${renderServiceCards(siteData.services || [])}
          </div>
          <div class="actions actions-inline">
            <a class="btn btn-primary" href="/hire/">See engagement options</a>
            <a class="btn btn-secondary" href="/estimate/">Get Automation Estimate</a>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="selected-work-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="selected-work-heading">Selected systems and product delivery</h2>
            <p>Highest-fit proof for internal tools, automation, platform delivery, and Android + AI execution.</p>
          </div>
          <div class="grid case-grid case-grid-featured">
            ${featuredCases.map((item, index) => renderCaseCard(item, index, { showVisual: true })).join("")}
          </div>
          <div class="actions actions-inline">
            <a class="btn btn-primary" href="/work/">Review relevant work</a>
            <a class="btn btn-secondary" href="/estimate/">Get Automation Estimate</a>
          </div>
        </div>
      </section>

      ${renderTestimonials()}

      <section class="section" aria-labelledby="trust-heading">
        <div class="container trust-grid">
          <div class="card" data-animate>
            <h2 id="trust-heading">Why teams bring me in</h2>
            <ul class="list-dot">
              ${(siteData.trust?.credibility || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
            <h3 class="links-title">Good fit</h3>
            <ul class="list-dot">
              ${(siteData.hireFit?.goodFit || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
          <div class="card" data-animate style="--delay:0.06s">
            <h3>Working style</h3>
            <ul class="list-dot">
              ${(siteData.trust?.workingStyle || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
            <h3 class="links-title">Core stack</h3>
            <ul class="stack-list large">
              ${(siteData.trust?.stack || []).map((stack) => `<li>${escapeHtml(stack)}</li>`).join("")}
            </ul>
            <h3 class="links-title">Profiles</h3>
            <div class="profile-links">
              ${renderProfileLinks()}
            </div>
            ${renderCredentialLinks()}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <p class="eyebrow">Remote contract engineering</p>
          <h2>Ready to stop patching the same workflow every quarter?</h2>
          <p>Share the current process, blockers, and timeline. I will reply with the best starting scope within 24 hours.</p>
          ${renderContactChannels()}
          <div class="actions">
            <a class="btn btn-primary" href="/estimate/">Get Automation Estimate</a>
            <a class="btn btn-secondary" href="${escapeAttribute(scopeMailHref())}">Email project brief</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/",
    filePath: "index.html",
    title: `${siteData.site.name} | Remote Contract AI Workflow & Product Engineer`,
    description:
      "Remote contract engineer building AI-enabled workflows, internal tools, automation systems, and Android + AI product delivery.",
    body,
    jsonLd: [websiteJsonLd, personJsonLd, serviceJsonLd]
  };
}

function formatPostDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function writingIndexPage() {
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: notesData.indexTitle || "Writing",
    url: toAbsoluteUrl("/writing/"),
    isPartOf: toAbsoluteUrl("/")
  };

  const postsHtml = notes.length
    ? notes.map((post, index) => `
        <article class="card writing-card" data-animate style="--delay:${animationDelay(index, 0.05)}">
          <header class="writing-card-head">
            <p class="writing-meta">${escapeHtml(formatPostDate(post.date))}${post.tags && post.tags.length ? ` &middot; ${post.tags.map(escapeHtml).join(" &middot; ")}` : ""}</p>
            <h3><a href="/writing/${escapeAttribute(post.slug)}/">${escapeHtml(post.title)}</a></h3>
            <p class="writing-summary">${escapeHtml(post.summary || "")}</p>
          </header>
          <div class="writing-card-foot">
            <a class="text-link" href="/writing/${escapeAttribute(post.slug)}/">Read note &rarr;</a>
          </div>
        </article>
      `).join("")
    : `<p class="lead">First post coming soon.</p>`;

  const body = `
    <main id="main-content" tabindex="-1">
      <section class="page-hero section">
        <div class="container">
          <p class="eyebrow" data-animate>${escapeHtml(notesData.indexEyebrow || "Writing")}</p>
          <h1 data-animate style="--delay:0.04s">${escapeHtml(notesData.indexTitle || "Writing")}</h1>
          <p data-animate style="--delay:0.08s">${escapeHtml(notesData.indexLead || "")}</p>
        </div>
      </section>

      <section class="section section-tight">
        <div class="container">
          <div class="grid writing-grid">
            ${postsHtml}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Working on something I should write about next?</h2>
          <p>Most of these notes come out of active client work. If you have a project in mind, share the scope and I will reply with the best starting point.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/contact/">Share your scope</a>
            <a class="btn btn-secondary" href="/work/">Review relevant work</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/writing/",
    filePath: path.join("writing", "index.html"),
    title: `Writing | ${siteData.site.name}`,
    description: notesData.indexLead || "Notes on real client builds — architecture, tradeoffs, and what shipped.",
    body,
    jsonLd: [collectionJsonLd]
  };
}

function writingPostPage(post) {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Person", name: siteData.site.name, url: siteUrl + "/" },
    url: toAbsoluteUrl(`/writing/${post.slug}/`),
    description: post.summary || "",
    inLanguage: "en-US"
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: toAbsoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Writing", item: toAbsoluteUrl("/writing/") },
      { "@type": "ListItem", position: 3, name: post.title, item: toAbsoluteUrl(`/writing/${post.slug}/`) }
    ]
  };

  const bodyParagraphs = (post.body || []).map((para) => `<p>${escapeHtml(para)}</p>`).join("");

  const body = `
    <main id="main-content" tabindex="-1">
      <article class="section">
        <div class="container container-narrow">
          <nav class="breadcrumb" data-animate>
            <a href="/writing/">&larr; Writing</a>
          </nav>
          <header class="writing-post-head" data-animate style="--delay:0.04s">
            <p class="writing-meta">${escapeHtml(formatPostDate(post.date))}${post.tags && post.tags.length ? ` &middot; ${post.tags.map(escapeHtml).join(" &middot; ")}` : ""}</p>
            <h1>${escapeHtml(post.title)}</h1>
            ${post.summary ? `<p class="lead">${escapeHtml(post.summary)}</p>` : ""}
          </header>
          <div class="writing-post-body" data-animate style="--delay:0.08s">
            ${bodyParagraphs}
          </div>
        </div>
      </article>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Have a similar workflow to ship?</h2>
          <p>Most notes here come from real client builds. If you are running into something similar, share the current state and target outcome.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/contact/">Share your scope</a>
            <a class="btn btn-secondary" href="/work/">Review relevant work</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: `/writing/${post.slug}/`,
    filePath: path.join("writing", post.slug, "index.html"),
    title: `${post.title} | ${siteData.site.name}`,
    description: post.summary || post.title,
    body,
    jsonLd: [breadcrumbJsonLd, articleJsonLd],
    ogType: "article"
  };
}

function workPage() {
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Selected work by Rifki Rosada",
    itemListElement: caseStudies.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.title,
      url: toAbsoluteUrl(item.route)
    }))
  };

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Selected work",
    url: toAbsoluteUrl("/work/"),
    isPartOf: toAbsoluteUrl("/")
  };

  const body = `
    <main id="main-content" tabindex="-1">
      <section class="page-hero section">
        <div class="container">
          <p class="eyebrow" data-animate>${escapeHtml(siteData.site.heroEyebrow)}</p>
          <h1 data-animate style="--delay:0.04s">Selected work</h1>
          <p data-animate style="--delay:0.08s">Case studies covering client systems, automation delivery, Android AI UX, and public Android + AI product work.</p>
          <div class="actions" data-animate style="--delay:0.12s">
            <a class="btn btn-primary" href="#client-work-heading">Review client systems</a>
            <a class="btn btn-secondary" href="/hire/">See engagement options</a>
          </div>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="client-work-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="client-work-heading">Client systems and delivery</h2>
            <p>Primary commercial proof across CRM, automation, Android + AI UX, platform delivery, and supporting product work.</p>
          </div>
          <div class="grid case-grid case-grid-work">
            ${clientCaseStudies.map((item, index) => renderCaseCard(item, index, { showVisual: true })).join("")}
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="public-work-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="public-work-heading">Public Android + AI products</h2>
            <p>Secondary proof through public Android, offline AI, and edge ML builds that stay relevant to product delivery.</p>
          </div>
          <div class="grid case-grid">
            ${publicCaseStudies.map((item, index) => renderCaseCard(item, index, { showVisual: true })).join("")}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Have a workflow, internal tool, or Android AI feature to ship?</h2>
          <p>Use the estimator for a planning range, or email the project brief directly if the scope is already clear.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/estimate/">Get Automation Estimate</a>
            <a class="btn btn-secondary" href="${escapeAttribute(scopeMailHref())}">Email project brief</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/work/",
    filePath: path.join("work", "index.html"),
    title: `Selected Work | ${siteData.site.name}`,
    description:
      "Case studies in CRM delivery, automation systems, Android AI UX, platform delivery, and public Android + AI product work.",
    body,
    jsonLd: [collectionJsonLd, itemListJsonLd]
  };
}

function casePage(caseStudy) {
  const isClientCase = caseStudy.type === "client";
  const ndaLead = isClientCase
    ? "Client details remain NDA-safe. The proof here stays factual and focused on delivery scope, constraints, and outcomes."
    : "Public product details only. No client-sensitive information is disclosed.";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: toAbsoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Work", item: toAbsoluteUrl("/work/") },
      { "@type": "ListItem", position: 3, name: caseStudy.title, item: toAbsoluteUrl(caseStudy.route) }
    ]
  };

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: caseStudy.title,
    description: caseStudy.shortSummary,
    dateModified: buildDate,
    inLanguage: "en-US",
    author: {
      "@type": "Person",
      name: siteData.site.name,
      url: toAbsoluteUrl("/")
    },
    url: toAbsoluteUrl(caseStudy.route),
    mainEntityOfPage: toAbsoluteUrl(caseStudy.route),
    articleSection: caseStudy.category,
    keywords: (caseStudy.techStack || []).join(", ")
  };

  const keyOutcomes = (caseStudy.results || []).slice(0, 3);

  const body = `
    <main id="main-content" tabindex="-1">
      <section class="page-hero section">
        <div class="container">
          <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span aria-hidden="true">/</span>
            <a href="/work/">Work</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">${escapeHtml(caseStudy.title)}</span>
          </nav>
          <p class="eyebrow" data-animate>${escapeHtml(siteData.site.name)} | ${escapeHtml(caseStudy.category)}</p>
          <h1 data-animate style="--delay:0.04s">${escapeHtml(caseStudy.title)}</h1>
          <p data-animate style="--delay:0.08s">${escapeHtml(caseStudy.shortSummary)}</p>
          <div class="meta-badges" data-animate style="--delay:0.12s">
            <span>${escapeHtml(caseStudy.role)}</span>
            <span>${escapeHtml(caseStudy.timeline)}</span>
            <span>${escapeHtml(caseStudy.type === "client" ? "Remote contract delivery" : "Public product build")}</span>
          </div>
          <div class="case-snapshot" data-animate style="--delay:0.16s">
            <ul class="case-summary case-summary-expanded">
              <li>
                <span class="case-summary-label">Problem</span>
                <p>${escapeHtml(caseStudy.problem || caseStudy.shortSummary)}</p>
              </li>
              <li>
                <span class="case-summary-label">My scope</span>
                <p>${escapeHtml((caseStudy.approach || [])[0] || caseStudy.shortSummary)}</p>
              </li>
              <li>
                <span class="case-summary-label">Result</span>
                <p>${escapeHtml(caseStudy.outcome || (caseStudy.results || [])[0] || caseStudy.shortSummary)}</p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section class="section section-tight">
        <div class="container case-layout">
          <aside class="card case-glance" data-animate>
            <h2>Delivery snapshot</h2>
            <dl class="glance-list">
              <div>
                <dt>Context</dt>
                <dd>${escapeHtml(caseStudy.category)}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>${escapeHtml(caseStudy.role)}</dd>
              </div>
              <div>
                <dt>Timeline</dt>
                <dd>${escapeHtml(caseStudy.timeline)}</dd>
              </div>
              <div>
                <dt>Stack</dt>
                <dd>
                  <ul class="stack-list">
                    ${(caseStudy.techStack || []).map((tech) => `<li>${escapeHtml(tech)}</li>`).join("")}
                  </ul>
                </dd>
              </div>
              <div>
                <dt>Key outcomes</dt>
                <dd>
                  <ul class="list-dot">
                    ${keyOutcomes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                  </ul>
                </dd>
              </div>
            </dl>
            <p class="nda-note">${escapeHtml(ndaLead)}</p>
            ${caseStudy.ndaNote ? `<p class="nda-proof-line">${escapeHtml(caseStudy.ndaNote)}</p>` : ""}
          </aside>

          <article class="card case-detail" data-animate style="--delay:0.06s">
            <section>
              <h2>Problem</h2>
              <p>${escapeHtml(caseStudy.problem)}</p>
            </section>
            <section>
              <h2>Constraints</h2>
              <ul class="list-dot">
                ${(caseStudy.constraints || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
            <section>
              <h2>System workflow</h2>
              <ul class="list-dot">
                ${(caseStudy.approach || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
            <section>
              <h2>Result</h2>
              <ul class="list-dot">
                ${(caseStudy.results || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
            ${renderCaseTestimonial(caseStudy)}
            <section>
              <h2>Tech stack</h2>
              <ul class="stack-list large">
                ${(caseStudy.techStack || []).map((tech) => `<li>${escapeHtml(tech)}</li>`).join("")}
              </ul>
            </section>
          </article>
        </div>
      </section>

      ${renderRelatedCaseCards(caseStudy)}

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Have a similar workflow?</h2>
          <p>Use the estimator for a planning range, or email the project brief directly if the scope is already clear.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/estimate/">Get Automation Estimate</a>
            <a class="btn btn-secondary" href="${escapeAttribute(scopeMailHref())}">Email project brief</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: caseStudy.route,
    filePath: path.join("work", caseStudy.slug, "index.html"),
    title: `${caseStudy.title} Case Study | ${siteData.site.name}`,
    description: caseStudy.shortSummary,
    body,
    ogType: "article",
    ogImage: `${siteUrl}/assets/images/cases/${caseStudy.slug}.png`,
    ogImageAlt: `${caseStudy.title} case study preview`,
    ogImageWidth: 1200,
    ogImageHeight: 675,
    jsonLd: [breadcrumbJsonLd, articleJsonLd]
  };
}

function hirePage() {
  const packages = [...(siteData.services || []), siteData.retainer].filter(Boolean);

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Remote contract engineering",
    provider: {
      "@type": "Person",
      name: siteData.site.name,
      url: toAbsoluteUrl("/")
    },
    serviceType: "Software engineering",
    areaServed: "Remote",
    description:
      "Remote contract engineering for AI-enabled workflows, internal tools, automation systems, and Android + AI product delivery.",
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: toAbsoluteUrl("/hire/"),
      availableLanguage: "English"
    }
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (siteData.hireFaqs || []).map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };

  const body = `
    <main id="main-content" tabindex="-1">
      <section class="page-hero section">
        <div class="container">
          <p class="eyebrow" data-animate>${escapeHtml(siteData.site.heroEyebrow)}</p>
          <h1 data-animate style="--delay:0.04s">Hire ${escapeHtml(siteData.site.name)}</h1>
          <p data-animate style="--delay:0.08s">Remote contract support for AI-enabled workflows, internal tools, automation systems, and Android + AI product delivery.</p>
          <div class="avail-badge" data-animate style="--delay:0.10s;margin-top:0.8rem"><span class="avail-dot" aria-hidden="true"></span>${escapeHtml(siteData.site.heroAvailability || "Currently open to new projects")}</div>
          <div class="actions" data-animate style="--delay:0.14s">
            <a class="btn btn-primary" href="/estimate/">Get Automation Estimate</a>
            <a class="btn btn-secondary" href="${escapeAttribute(scopeMailHref())}">Email project brief</a>
            <a class="btn btn-secondary" href="${escapeAttribute(resumeHref())}">Download resume</a>
          </div>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="packages-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="packages-heading">Engagement options</h2>
            <p>Clear paths for internal tools, automation systems, Android + AI delivery, and ongoing remote execution.</p>
            <p class="pricing-note"><strong>Scope-based pricing.</strong> Use the estimator for a fast IDR/USD budget range, then I can confirm the final scope after a technical audit. No retainer required to start.</p>
          </div>
          <div class="grid grid-2">
            ${renderServiceCards(packages)}
          </div>
          <div class="actions actions-inline">
            <a class="btn btn-primary" href="/estimate/">Get Automation Estimate</a>
            <a class="btn btn-secondary" href="/work/">Review relevant work</a>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="fit-heading">
        <div class="container trust-grid">
          <div class="card" data-animate>
            <h2 id="fit-heading">Good fit</h2>
            <ul class="list-dot">
              ${(siteData.hireFit?.goodFit || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
          <div class="card" data-animate style="--delay:0.06s">
            <h3>Working style</h3>
            <ul class="list-dot">
              ${(siteData.hireFit?.workingStyle || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="process-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="process-heading">How the work runs</h2>
            <p>Scope-first delivery with clear milestones, concise remote updates, and clean handoff context.</p>
          </div>
          <ul class="process-grid">
            ${renderProcessCards(siteData.workProcess || [])}
          </ul>
        </div>
      </section>

      <section class="section" aria-labelledby="faq-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="faq-heading">Questions I usually get</h2>
            <p>Practical answers about fit, remote collaboration, and where Android sits in the overall offer.</p>
          </div>
          <div class="grid grid-2 faq-grid">
            ${renderFaqCards(siteData.hireFaqs || [])}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Need a scoped delivery partner?</h2>
          <p>Send the current workflow, blockers, and target outcome. I will respond with the best first milestone.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/estimate/">Get Automation Estimate</a>
            <a class="btn btn-secondary" href="/work/">Review relevant work</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/hire/",
    filePath: path.join("hire", "index.html"),
    title: `Hire ${siteData.site.name} | Remote Contract Product Engineer`,
    description:
      "Hire Rifki Rosada for remote contract work across internal tools, automation systems, AI-enabled workflows, and Android + AI product delivery.",
    body,
    jsonLd: [serviceJsonLd, faqJsonLd]
  };
}

function experiencePage() {
  const body = `
    <main id="main-content" tabindex="-1">
      <section class="page-hero section">
        <div class="container">
          <p class="eyebrow" data-animate>${escapeHtml(siteData.site.name)} | Delivery background</p>
          <h1 data-animate style="--delay:0.04s">Experience</h1>
          <p data-animate style="--delay:0.08s">Supporting context behind the case studies: remote contract delivery first, earlier team experience second.</p>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="experience-list-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="experience-list-heading">Roles and highlights</h2>
            <p>The strongest proof still lives in the work pages. This page stays as supporting background.</p>
          </div>
          <div class="grid grid-2">
            ${(siteData.experience || [])
              .map(
                (item, index) => `
                <article class="card" data-animate style="--delay:${animationDelay(index, 0.06)}">
                  <p class="case-kicker">${escapeHtml(item.period)}</p>
                  <h3>${escapeHtml(item.title)}</h3>
                  <p>${escapeHtml(item.description)}</p>
                  <ul class="list-dot">
                    ${(item.highlights || []).map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}
                  </ul>
                </article>
              `
              )
              .join("")}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Want the strongest proof first?</h2>
          <p>Start with the case studies, then send scope if the work looks aligned.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/work/">Review relevant work</a>
            <a class="btn btn-secondary" href="/contact/">Share your scope</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/experience/",
    filePath: path.join("experience", "index.html"),
    title: `Experience | ${siteData.site.name}`,
    description:
      "Delivery background across remote contract work, client systems, automation, Android AI UX, and earlier team experience.",
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      name: `${siteData.site.name} experience`,
      url: toAbsoluteUrl("/experience/"),
      isPartOf: toAbsoluteUrl("/")
    }
  };
}

function contactPage() {
  const introTemplate = (siteData.introTemplate || []).join("\n");
  const scopeTemplate = (siteData.scopeTemplate || []).join("\n");
  const channels = [
    { label: "Email", value: siteData.contact.email, href: emailProjectBriefHref() },
    { label: resumeLabel(), value: "Download PDF", href: resumeHref() },
    { label: "LinkedIn", value: "Open profile", href: siteData.contact.linkedin },
    { label: "GitHub", value: "View repositories", href: siteData.contact.github }
  ];

  if (siteData.contact.whatsapp) {
    channels.splice(1, 0, { label: "WhatsApp", value: "Open chat", href: siteData.contact.whatsapp });
  }

  const body = `
    <main id="main-content" tabindex="-1">
      <section class="page-hero section">
        <div class="container">
          <p class="eyebrow" data-animate>${escapeHtml(siteData.site.heroEyebrow)}</p>
          <h1 data-animate style="--delay:0.04s">Share your scope</h1>
          <p data-animate style="--delay:0.08s">Send the project brief, blockers, and timeline. I will reply with the best starting scope for the work.</p>
          <div class="avail-badge" data-animate style="--delay:0.10s;margin-top:0.6rem"><span class="avail-dot" aria-hidden="true"></span>${escapeHtml(siteData.site.heroAvailability || "Open to new projects")} &mdash; replies within 24h on weekdays</div>
          <div class="actions" data-animate style="--delay:0.16s">
            <a class="btn btn-primary" href="/estimate/">Get Automation Estimate</a>
            <a class="btn btn-secondary" href="${escapeAttribute(scopeMailHref())}">Email project brief</a>
            <button class="btn btn-secondary" type="button" data-copy-target="contact-scope-template-quick" data-copy-feedback="contact-scope-quick-feedback">Copy scope template</button>
          </div>
          <div class="hero-links" data-animate style="--delay:0.2s">
            <a class="text-link" href="/hire/">See engagement options</a>
            <a class="text-link" href="/work/">Review relevant work</a>
          </div>
          <p id="contact-scope-quick-feedback" class="copy-feedback" role="status" aria-live="polite">Paste the template, add details, then send.</p>
          <pre id="contact-scope-template-quick" class="sr-only-copy-source">${escapeHtml(scopeTemplate)}</pre>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="channel-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="channel-heading">Direct channels</h2>
            <p>Low-friction contact stays visible. Email is the fastest route for scoped work.</p>
          </div>
          <div class="grid grid-2">
            ${channels
              .map(
                (item, index) => `
                <article class="card channel-card" data-animate style="--delay:${animationDelay(index, 0.05)}">
                  <h3>${escapeHtml(item.label)}</h3>
                  <p>${escapeHtml(item.value)}</p>
                  <a class="text-link" href="${escapeAttribute(item.href)}"${externalLinkAttributes(item.href)}>Open ${escapeHtml(item.label)}</a>
                </article>
              `
              )
              .join("")}
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="contact-template-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="contact-template-heading">Project brief templates</h2>
            <p>Use one of these if you want a faster first response and a cleaner handoff into milestones.</p>
          </div>
          <div class="grid grid-2 copy-grid">
            <article class="card copy-card" data-animate>
              <h3>Intro message</h3>
              <pre id="contact-intro-template">${escapeHtml(introTemplate)}</pre>
              <button class="btn btn-secondary" type="button" data-copy-target="contact-intro-template" data-copy-feedback="contact-intro-feedback">Copy intro message</button>
              <p id="contact-intro-feedback" class="copy-feedback" role="status" aria-live="polite">Customize before sending so I can respond with better context.</p>
            </article>
            <article class="card copy-card" data-animate style="--delay:0.08s">
              <h3>Scope template</h3>
              <pre id="contact-scope-template">${escapeHtml(scopeTemplate)}</pre>
              <button class="btn btn-secondary" type="button" data-copy-target="contact-scope-template" data-copy-feedback="contact-scope-feedback">Copy scope template</button>
              <p id="contact-scope-feedback" class="copy-feedback" role="status" aria-live="polite">Include timeline and definition of done for the most useful reply.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Prefer to keep it simple?</h2>
          <p>Use the estimator for a structured pre-audit summary, or email the project brief directly if you already know the scope.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/estimate/">Get Automation Estimate</a>
            <a class="btn btn-secondary" href="${escapeAttribute(scopeMailHref())}">Email project brief</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/contact/",
    filePath: path.join("contact", "index.html"),
    title: `Share Your Scope | ${siteData.site.name}`,
    description:
      "Share project scope, blockers, and timeline with Rifki Rosada for remote contract engineering support.",
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      name: `${siteData.site.name} contact`,
      url: toAbsoluteUrl("/contact/"),
      isPartOf: toAbsoluteUrl("/")
    }
  };
}

function notFoundPage() {
  const body = `
    <main id="main-content" tabindex="-1">
      <section class="section notice-404">
        <div class="container" data-animate>
          <h1>404 - Page not found</h1>
          <p>This page is unavailable. Jump back to the main portfolio paths below.</p>
          <div class="actions actions-center">
            <a class="btn btn-secondary" href="/">Go home</a>
            <a class="btn btn-secondary" href="/work/">Review work</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/404/",
    filePath: "404.html",
    title: `404 | ${siteData.site.name}`,
    description: "Page not found.",
    body,
    noIndex: true,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "404",
      isPartOf: toAbsoluteUrl("/")
    }
  };
}

function folderNotFoundPage() {
  const page = notFoundPage();
  return {
    ...page,
    filePath: path.join("404", "index.html")
  };
}

function redirectPage(redirect) {
  const body = `
    <main id="main-content" tabindex="-1">
      <section class="section notice-404">
        <div class="container" data-animate>
          <h1>${escapeHtml(redirect.title)}</h1>
          <p>This path has moved. Continue to the updated page.</p>
          <div class="actions actions-center">
            <a class="btn btn-secondary" href="${escapeAttribute(redirect.to)}">Open updated page</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: redirect.from,
    filePath: path.join(redirect.from.replace(/^\//, ""), "index.html"),
    title: redirect.title,
    description: `Redirecting to ${redirect.to}`,
    body,
    noIndex: true,
    injectHead: `<meta http-equiv="refresh" content="0;url=${escapeAttribute(redirect.to)}">`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: redirect.title,
      url: toAbsoluteUrl(redirect.from),
      mainEntityOfPage: toAbsoluteUrl(redirect.to)
    }
  };
}

function caseVisualSvg(caseStudy) {
  const title = truncate(caseStudy.title, 42);
  const outcome = truncate(caseStudy.outcome || caseStudy.shortSummary, 88);
  const techLine = truncate((caseStudy.techStack || []).slice(0, 4).join(" | "), 72);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(caseStudy.title)}</title>
  <desc id="desc">${escapeXml(caseStudy.visualCaption || "Case study visual")}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#081120"/>
      <stop offset="55%" stop-color="#0d1830"/>
      <stop offset="100%" stop-color="#121f3f"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#79c4ff"/>
      <stop offset="100%" stop-color="#8ef0dc"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="675" fill="url(#bg)"/>
  <circle cx="1020" cy="120" r="180" fill="rgba(120,196,255,0.08)"/>
  <circle cx="190" cy="560" r="220" fill="rgba(142,240,220,0.08)"/>
  <rect x="72" y="70" width="1056" height="535" rx="24" fill="none" stroke="rgba(130,175,255,0.28)" stroke-width="2"/>

  <rect x="120" y="148" width="400" height="160" rx="18" fill="rgba(20,36,67,0.78)" stroke="rgba(130,175,255,0.32)"/>
  <rect x="565" y="148" width="220" height="160" rx="18" fill="rgba(18,43,74,0.78)" stroke="rgba(130,175,255,0.32)"/>
  <rect x="830" y="148" width="250" height="160" rx="18" fill="rgba(14,33,60,0.78)" stroke="rgba(130,175,255,0.32)"/>
  <path d="M520 228h45" stroke="url(#accent)" stroke-width="5" stroke-linecap="round"/>
  <path d="M785 228h45" stroke="url(#accent)" stroke-width="5" stroke-linecap="round"/>

  <text x="120" y="380" fill="#8ef0dc" font-size="24" font-family="'Segoe UI', Tahoma, sans-serif">${escapeXml(caseStudy.category)}</text>
  <text x="120" y="432" fill="#f0f5ff" font-size="42" font-family="'Segoe UI', Tahoma, sans-serif" font-weight="700">${escapeXml(title)}</text>
  <text x="120" y="486" fill="#c0d0ed" font-size="24" font-family="'Segoe UI', Tahoma, sans-serif">${escapeXml(outcome)}</text>
  <text x="120" y="540" fill="#9bc7ff" font-size="22" font-family="'Segoe UI', Tahoma, sans-serif">${escapeXml(techLine)}</text>
</svg>`;
}

function sitePreviewSvg() {
  const name = truncate(siteData.site.name, 28);
  const title = truncate(siteData.site.title, 44);
  const tagline = truncate(siteData.site.tagline, 92);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(siteData.site.name)} portfolio preview</title>
  <desc id="desc">${escapeXml(siteData.site.tagline)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#08101f"/>
      <stop offset="60%" stop-color="#0c1630"/>
      <stop offset="100%" stop-color="#111f40"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7bc5ff"/>
      <stop offset="100%" stop-color="#8ef0dc"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="985" cy="92" r="180" fill="rgba(123,197,255,0.12)"/>
  <circle cx="170" cy="560" r="210" fill="rgba(142,240,220,0.08)"/>
  <rect x="72" y="62" width="1056" height="506" rx="28" fill="none" stroke="rgba(130,175,255,0.28)" stroke-width="2"/>
  <text x="120" y="170" fill="#8ef0dc" font-size="28" font-family="'Segoe UI', Tahoma, sans-serif">${escapeXml("Rifki Rosada | Remote contract engineer")}</text>
  <text x="120" y="275" fill="#f2f7ff" font-size="66" font-family="'Segoe UI', Tahoma, sans-serif" font-weight="700">${escapeXml(name)}</text>
  <text x="120" y="355" fill="#9ac9ff" font-size="38" font-family="'Segoe UI', Tahoma, sans-serif">${escapeXml(title)}</text>
  <rect x="120" y="396" width="360" height="6" rx="3" fill="url(#accent)"/>
  <text x="120" y="472" fill="#c6d6f3" font-size="28" font-family="'Segoe UI', Tahoma, sans-serif">${escapeXml(tagline)}</text>
</svg>`;
}

async function writeCaseVisualAssets(caseStudy) {
  const svgMarkup = caseVisualSvg(caseStudy);
  const basePath = path.join("assets", "images", "cases");
  await writeTextFile(path.join(basePath, `${caseStudy.slug}.svg`), svgMarkup);

  const svgBuffer = Buffer.from(svgMarkup, "utf8");
  const resizeConfig = { width: 1200, height: 675, fit: "cover" };

  const pngBuffer = await sharp(svgBuffer, { density: 220 })
    .resize(resizeConfig)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const webpBuffer = await sharp(svgBuffer, { density: 220 })
    .resize(resizeConfig)
    .webp({ quality: 76, effort: 5 })
    .toBuffer();
  const avifBuffer = await sharp(svgBuffer, { density: 220 })
    .resize(resizeConfig)
    .avif({ quality: 56, effort: 6 })
    .toBuffer();

  await writeBinaryFile(path.join(basePath, `${caseStudy.slug}.png`), pngBuffer);
  await writeBinaryFile(path.join(basePath, `${caseStudy.slug}.webp`), webpBuffer);
  await writeBinaryFile(path.join(basePath, `${caseStudy.slug}.avif`), avifBuffer);
}

async function writeSitePreviewAsset() {
  const svgMarkup = sitePreviewSvg();
  const svgBuffer = Buffer.from(svgMarkup, "utf8");
  const pngBuffer = await sharp(svgBuffer, { density: 220 })
    .resize({ width: 1200, height: 630, fit: "cover" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  await writeBinaryFile("og-image.png", pngBuffer);
}

function sitemapXml(pages) {
  const entries = pages
    .filter((page) => !page.noIndex)
    .map((page) => `  <url>\n    <loc>${toAbsoluteUrl(page.route)}</loc>\n    <lastmod>${buildDate}</lastmod>\n  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

function robotsTxt() {
  const host = new URL(siteUrl).host;
  return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
Host: ${host}`;
}

function webManifest() {
  return JSON.stringify(
    {
      name: `${siteData.site.name} - ${siteData.site.title}`,
      short_name: siteData.site.name,
      description: siteData.site.tagline,
      start_url: "/",
      display: "standalone",
      background_color: "#08101f",
      theme_color: siteData.site.themeColor || "#0a0f1e",
      icons: [
        {
          src: "/favicon-192.png",
          sizes: "192x192",
          type: "image/png"
        },
        {
          src: "/favicon-512.png",
          sizes: "512x512",
          type: "image/png"
        }
      ]
    },
    null,
    2
  );
}

function normalizeTextContent(content) {
  return String(content)
    .trim()
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

function normalizeFilePathSlashes(value) {
  return value.replace(/\\/g, "/");
}

function buffersEqual(a, b) {
  return a.length === b.length && Buffer.compare(a, b) === 0;
}

async function writeOutputBuffer(relativePath, buffer) {
  const targetPath = path.join(rootDir, relativePath);
  const normalizedPath = normalizeFilePathSlashes(relativePath);

  if (isCheckMode) {
    try {
      const current = await fs.readFile(targetPath);
      if (!buffersEqual(current, buffer)) {
        checkMismatches.add(`Mismatch: ${normalizedPath}`);
      }
    } catch {
      checkMismatches.add(`Missing: ${normalizedPath}`);
    }
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
  writtenFiles.push(normalizedPath);
}

async function writeTextFile(relativePath, content) {
  const normalized = `${normalizeTextContent(content)}\n`;
  await writeOutputBuffer(relativePath, Buffer.from(normalized, "utf8"));
}

async function writeBinaryFile(relativePath, content) {
  await writeOutputBuffer(relativePath, content);
}

async function writeBinaryCopy(sourceRelativePath, targetRelativePath) {
  const source = path.join(rootDir, sourceRelativePath);
  const buffer = await fs.readFile(source);
  await writeBinaryFile(targetRelativePath, buffer);
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>+~])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

async function writeMinifiedStylesheet() {
  const sourcePath = path.join(rootDir, "assets", "css", "site.css");
  const sourceCss = await fs.readFile(sourcePath, "utf8");
  const minifiedCss = minifyCss(sourceCss);
  await writeTextFile(path.join("assets", "css", "site.min.css"), minifiedCss);
}

async function removeLegacyTextArtifacts() {
  if (isCheckMode) return;

  const candidates = [
    "index.txt",
    "__next._full.txt",
    "__next._head.txt",
    "__next._index.txt",
    "__next._tree.txt",
    "projects/index.txt",
    "projects/__next.projects.txt",
    "projects/__next._full.txt",
    "projects/__next._head.txt",
    "projects/__next._index.txt",
    "projects/__next._tree.txt",
    "projects/__next.projects/__PAGE__.txt",
    "experience/index.txt",
    "experience/__next.experience.txt",
    "experience/__next._full.txt",
    "experience/__next._head.txt",
    "experience/__next._index.txt",
    "experience/__next._tree.txt",
    "experience/__next.experience/__PAGE__.txt",
    "contact/index.txt",
    "contact/__next.contact.txt",
    "contact/__next._full.txt",
    "contact/__next._head.txt",
    "contact/__next._index.txt",
    "contact/__next._tree.txt",
    "contact/__next.contact/__PAGE__.txt",
    "404/index.txt",
    "404/__next.404.txt",
    "404/__next._full.txt",
    "404/__next._head.txt",
    "404/__next._index.txt",
    "404/__next._tree.txt",
    "404/__next.404/__PAGE__.txt"
  ];

  await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await fs.rm(path.join(rootDir, candidate.replace(/\//g, path.sep)), { force: true });
      } catch {
        // ignore
      }
    })
  );
}

function routeToWorkSlug(route) {
  const normalized = normalizeRoute(route).replace(/^\/+|\/+$/g, "");
  if (!normalized.startsWith("work/")) return null;
  const slug = normalized.slice("work/".length);
  return slug && !slug.includes("/") ? slug : null;
}

async function removeStaleCaseOutput() {
  if (isCheckMode) return;

  const keepWorkDirectories = new Set(caseStudies.map((item) => item.slug));
  for (const redirect of siteData.legacyRedirects || []) {
    const legacySlug = routeToWorkSlug(redirect.from);
    if (legacySlug) {
      keepWorkDirectories.add(legacySlug);
    }
  }

  try {
    const workEntries = await fs.readdir(path.join(rootDir, "work"), { withFileTypes: true });
    await Promise.all(
      workEntries
        .filter((entry) => entry.isDirectory() && !keepWorkDirectories.has(entry.name))
        .map((entry) => fs.rm(path.join(rootDir, "work", entry.name), { recursive: true, force: true }))
    );
  } catch {
    // ignore
  }

  const keepCaseImages = new Set();
  for (const item of caseStudies) {
    keepCaseImages.add(`${item.slug}.svg`);
    keepCaseImages.add(`${item.slug}.png`);
    keepCaseImages.add(`${item.slug}.webp`);
    keepCaseImages.add(`${item.slug}.avif`);
  }

  try {
    const imageEntries = await fs.readdir(path.join(rootDir, "assets", "images", "cases"), {
      withFileTypes: true
    });
    await Promise.all(
      imageEntries
        .filter(
          (entry) =>
            entry.isFile() &&
            [".svg", ".png", ".webp", ".avif"].includes(path.extname(entry.name).toLowerCase()) &&
            !keepCaseImages.has(entry.name)
        )
        .map((entry) => fs.rm(path.join(rootDir, "assets", "images", "cases", entry.name), { force: true }))
    );
  } catch {
    // ignore
  }
}

async function removeLegacyDirectories() {
  if (isCheckMode) return;

  const directories = ["_not-found"];
  await Promise.all(
    directories.map(async (directory) => {
      try {
        await fs.rm(path.join(rootDir, directory), { recursive: true, force: true });
      } catch {
        // ignore
      }
    })
  );
}

async function ensureOffscanSupportFiles() {
  const appRoot = "apps/offscanai";
  await writeBinaryCopy("favicon-512.png", `${appRoot}/icon.png`);
  await writeBinaryCopy("og-image.png", `${appRoot}/preview.png`);

  const pages = [
    {
      file: `${appRoot}/privacy.html`,
      title: "OffScan AI Privacy Policy",
      description: "Privacy policy for OffScan AI.",
      body: "<p>OffScan AI is designed for privacy-first usage. OCR processing is intended to run on-device and no user account is required.</p><p>No sensitive project data is published on this page. Contact support for policy questions.</p>"
    },
    {
      file: `${appRoot}/terms.html`,
      title: "OffScan AI Terms of Service",
      description: "Terms of service for OffScan AI.",
      body: "<p>By using OffScan AI, you agree to use the app responsibly and in compliance with local laws.</p><p>Product behavior and support scope may be updated as the app evolves.</p>"
    },
    {
      file: `${appRoot}/refund.html`,
      title: "OffScan AI Refund Policy",
      description: "Refund policy for OffScan AI.",
      body: "<p>Purchases and refunds are handled through the Google Play billing policy associated with your transaction.</p><p>For billing disputes, use Google Play support channels first, then contact app support if needed.</p>"
    },
    {
      file: `${appRoot}/support.html`,
      title: "OffScan AI Support",
      description: "Support information for OffScan AI.",
      body: `<p>For help with OffScan AI, contact: <a href="mailto:${escapeAttribute(siteData.contact.email)}">${escapeHtml(siteData.contact.email)}</a></p><p>Include your device model, Android version, and issue summary for faster troubleshooting.</p>`
    }
  ];

  for (const page of pages) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeAttribute(page.description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${escapeAttribute(`${siteUrl}/${page.file}`)}">
  <style>
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #08101f; color: #e8efff; }
    main { max-width: 740px; margin: 0 auto; padding: 3rem 1rem 4rem; line-height: 1.7; }
    a { color: #8fd1ff; }
    h1 { line-height: 1.2; margin-top: 0; }
    .back { margin-top: 2rem; display: inline-flex; color: #b4d8ff; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(page.title)}</h1>
    ${page.body}
    <a class="back" href="/apps/offscanai/">Back to OffScan AI</a>
  </main>
</body>
</html>`;

    await writeTextFile(page.file, html);
  }
}

async function ensureOffscanLegacyMetadata() {
  const pages = [
    {
      file: path.join("apps", "offscanai", "faq", "index.html"),
      canonical: `${siteUrl}/apps/offscanai/faq/`
    },
    {
      file: path.join("apps", "offscanai", "premium", "index.html"),
      canonical: `${siteUrl}/apps/offscanai/premium/`
    }
  ];

  for (const page of pages) {
    const targetPath = path.join(rootDir, page.file);
    let source;
    try {
      source = await fs.readFile(targetPath, "utf8");
    } catch {
      continue;
    }

    let updated = source;
    if (/<meta name="robots" content="[^"]*"\/?>/.test(updated)) {
      updated = updated.replace(/<meta name="robots" content="[^"]*"\/?>/, '<meta name="robots" content="noindex, follow"/>');
    } else {
      updated = updated.replace(
        /<meta name="lastUpdated"/,
        '<meta name="robots" content="noindex, follow"/><meta name="lastUpdated"'
      );
    }

    updated = updated.replace(/<link rel="canonical" href="[^"]*"\/>/, `<link rel="canonical" href="${page.canonical}"/>`);
    updated = updated.replace(/<meta property="og:url" content="[^"]*"\/>/, `<meta property="og:url" content="${page.canonical}"/>`);

    await writeTextFile(page.file, updated);
  }
}

async function collectHtmlFiles(startDir, list = []) {
  const entries = await fs.readdir(startDir, { withFileTypes: true });
  for (const entry of entries) {
    if ([".git", "node_modules", "_next", "tmp-chrome-lh"].includes(entry.name)) continue;

    const absolutePath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      await collectHtmlFiles(absolutePath, list);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      list.push(absolutePath);
    }
  }
  return list;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveLinkCandidates(targetPath) {
  const hasExtension = /\.[a-z0-9]+$/i.test(targetPath);
  if (targetPath.endsWith(path.sep)) {
    return [path.join(targetPath, "index.html")];
  }
  if (hasExtension) {
    return [targetPath];
  }
  return [targetPath, `${targetPath}.html`, path.join(targetPath, "index.html")];
}

async function validateInternalLinks() {
  const htmlFiles = await collectHtmlFiles(rootDir);
  const missing = [];

  for (const absoluteHtmlPath of htmlFiles) {
    const relativeHtmlPath = normalizeFilePathSlashes(path.relative(rootDir, absoluteHtmlPath));
    const source = await fs.readFile(absoluteHtmlPath, "utf8");
    const matches = source.matchAll(/(?:href|src)="([^"]+)"/g);

    for (const match of matches) {
      const raw = match[1];
      if (
        !raw ||
        raw.startsWith("http://") ||
        raw.startsWith("https://") ||
        raw.startsWith("mailto:") ||
        raw.startsWith("tel:") ||
        raw.startsWith("javascript:") ||
        raw.startsWith("data:") ||
        raw.startsWith("#")
      ) {
        continue;
      }

      const cleaned = raw.split("#")[0].split("?")[0];
      const basePath = cleaned.startsWith("/")
        ? path.join(rootDir, cleaned.replace(/^\//, ""))
        : path.resolve(path.dirname(absoluteHtmlPath), cleaned);

      const candidates = resolveLinkCandidates(basePath);
      let found = false;
      for (const candidate of candidates) {
        if (await fileExists(candidate)) {
          found = true;
          break;
        }
      }

      if (!found) {
        missing.push(`${relativeHtmlPath} -> ${cleaned}`);
      }
    }
  }

  if (missing.length > 0) {
    const report = missing.map((line) => `- ${line}`).join("\n");
    throw new Error(`Internal link validation failed:\n${report}`);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidUrl(value, { allowRelative = false } = {}) {
  if (!isNonEmptyString(value)) return false;
  if (allowRelative && value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function pushMissing(errors, value, label) {
  if (!isNonEmptyString(value)) {
    errors.push(`${label} is required.`);
  }
}

function collectStringValues(value, list = []) {
  if (typeof value === "string") {
    list.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, list));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStringValues(item, list));
  }
  return list;
}

function validateEstimateData(errors) {
  pushMissing(errors, estimateData.seo?.title, "estimate.seo.title");
  pushMissing(errors, estimateData.seo?.description, "estimate.seo.description");
  pushMissing(errors, estimateData.fallbackEmail, "estimate.fallbackEmail");
  pushMissing(errors, estimateData.hero?.headline, "estimate.hero.headline");
  pushMissing(errors, estimateData.hero?.subheadline, "estimate.hero.subheadline");
  pushMissing(errors, estimateData.form?.heading, "estimate.form.heading");
  pushMissing(errors, estimateData.form?.submitLabel, "estimate.form.submitLabel");
  pushMissing(errors, estimateData.contact?.submitLabel, "estimate.contact.submitLabel");
  pushMissing(errors, estimateData.disclaimer, "estimate.disclaimer");
  pushMissing(errors, estimateData.proof?.heading, "estimate.proof.heading");

  if (!isValidUrl(`mailto:${estimateData.fallbackEmail || ""}`)) {
    errors.push("estimate.fallbackEmail must be usable as a mailto URL.");
  }

  const bannedCopy = ["instant quote", "exact price", "cheap", "only", "guaranteed savings", "AI-powered calculator"];
  for (const text of collectStringValues(estimateData)) {
    if (text.includes("—")) {
      errors.push("estimate.json user-facing copy must not contain em dashes.");
      break;
    }
    const lower = text.toLowerCase();
    const banned = bannedCopy.find((phrase) => lower.includes(phrase.toLowerCase()));
    if (banned) {
      errors.push(`estimate.json user-facing copy must not include "${banned}".`);
      break;
    }
  }

  const sections = estimateData.form?.sections || [];
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push("estimate.form.sections must contain at least one section.");
  }

  const questionNames = new Set();
  for (const [sectionIndex, section] of sections.entries()) {
    const sectionLabel = `estimate.form.sections[${sectionIndex}]`;
    pushMissing(errors, section.id, `${sectionLabel}.id`);
    pushMissing(errors, section.heading, `${sectionLabel}.heading`);
    if (!Array.isArray(section.questions) || section.questions.length === 0) {
      errors.push(`${sectionLabel}.questions must contain at least one question.`);
      continue;
    }
    for (const [questionIndex, question] of section.questions.entries()) {
      const label = `${sectionLabel}.questions[${questionIndex}]`;
      pushMissing(errors, question.name, `${label}.name`);
      pushMissing(errors, question.label, `${label}.label`);
      if (!["radio", "checkbox", "select", "textarea"].includes(question.type)) {
        errors.push(`${label}.type must be radio, checkbox, select, or textarea.`);
      }
      if (question.name && questionNames.has(question.name)) {
        errors.push(`${label}.name must be unique.`);
      }
      questionNames.add(question.name);
      if (question.type !== "textarea" && (!Array.isArray(question.options) || question.options.length < 2)) {
        errors.push(`${label}.options must contain at least two options.`);
      }
      for (const [optionIndex, option] of (question.options || []).entries()) {
        pushMissing(errors, option.value, `${label}.options[${optionIndex}].value`);
        pushMissing(errors, option.label, `${label}.options[${optionIndex}].label`);
      }
    }
  }

  const requiredQuestionNames = [
    "location",
    "businessType",
    "automationNeeds",
    "currentProcess",
    "teamSize",
    "integrations",
    "dataComplexity",
    "urgency",
    "budgetReadiness",
    "projectDescription"
  ];
  for (const name of requiredQuestionNames) {
    if (!questionNames.has(name)) {
      errors.push(`estimate questions must include ${name}.`);
    }
  }

  const contactFields = estimateData.contact?.fields || [];
  const contactNames = new Set(contactFields.map((field) => field.name));
  for (const name of ["name", "company", "email", "whatsapp"]) {
    if (!contactNames.has(name)) {
      errors.push(`estimate.contact.fields must include ${name}.`);
    }
  }

  for (const market of ["indonesia", "international"]) {
    const packages = estimateData.pricing?.[market] || [];
    if (!Array.isArray(packages) || packages.length !== 4) {
      errors.push(`estimate.pricing.${market} must contain exactly four packages.`);
      continue;
    }
    for (const [index, item] of packages.entries()) {
      const label = `estimate.pricing.${market}[${index}]`;
      pushMissing(errors, item.id, `${label}.id`);
      pushMissing(errors, item.name, `${label}.name`);
      pushMissing(errors, item.range, `${label}.range`);
      pushMissing(errors, item.timeline, `${label}.timeline`);
    }
  }

  const proofItems = estimateData.proof?.items || [];
  if (!Array.isArray(proofItems) || proofItems.length === 0) {
    errors.push("estimate.proof.items must contain at least one item.");
  }
  for (const [index, item] of proofItems.entries()) {
    const label = `estimate.proof.items[${index}]`;
    pushMissing(errors, item.label, `${label}.label`);
    pushMissing(errors, item.outcome, `${label}.outcome`);
    if (!isValidUrl(item.href, { allowRelative: true })) {
      errors.push(`${label}.href must be a relative path or absolute https URL.`);
    }
  }
}

function validateContentData() {
  const errors = [];

  pushMissing(errors, siteData.site?.name, "site.name");
  pushMissing(errors, siteData.site?.title, "site.title");
  pushMissing(errors, siteData.site?.tagline, "site.tagline");
  pushMissing(errors, siteData.site?.heroHeadline, "site.heroHeadline");
  pushMissing(errors, siteData.site?.heroSubheadline, "site.heroSubheadline");
  pushMissing(errors, siteData.contact?.email, "contact.email");

  if (!isValidUrl(siteData.site?.url)) {
    errors.push("site.url must be an absolute https URL.");
  }
  if (!isValidUrl(siteData.contact?.email ? `mailto:${siteData.contact.email}` : "")) {
    errors.push("contact.email must be usable as a mailto URL.");
  }
  if (siteData.contact?.linkedin && !isValidUrl(siteData.contact.linkedin)) {
    errors.push("contact.linkedin must be an absolute https URL.");
  }
  if (siteData.contact?.github && !isValidUrl(siteData.contact.github)) {
    errors.push("contact.github must be an absolute https URL.");
  }
  if (siteData.resume?.href && !isValidUrl(siteData.resume.href, { allowRelative: true })) {
    errors.push("resume.href must be a relative path or absolute https URL.");
  }

  const packages = [...(siteData.services || []), siteData.retainer].filter(Boolean);
  for (const [index, item] of packages.entries()) {
    const label = `package[${index}]`;
    pushMissing(errors, item.name, `${label}.name`);
    pushMissing(errors, item.summary, `${label}.summary`);
    pushMissing(errors, item.timeline, `${label}.timeline`);
    if (!/^From \$[\d,]+(?:\/month)?$/.test(String(item.priceFrom || ""))) {
      errors.push(`${label}.priceFrom must look like "From $3,500" or "From $4,000/month".`);
    }
  }

  for (const [index, item] of (siteData.testimonials || []).entries()) {
    const label = `testimonial[${index}]`;
    pushMissing(errors, item.quote, `${label}.quote`);
    pushMissing(errors, item.clientName, `${label}.clientName`);
    pushMissing(errors, item.clientContext, `${label}.clientContext`);
    pushMissing(errors, item.meta, `${label}.meta`);
    if (item.translationLabel !== undefined && typeof item.translationLabel !== "string") {
      errors.push(`${label}.translationLabel must be a string when provided.`);
    }
  }

  for (const [index, credential] of (siteData.trust?.credentials || []).entries()) {
    if (credential.url && !isValidUrl(credential.url, { allowRelative: true })) {
      errors.push(`trust.credentials[${index}].url must be a relative path or absolute https URL.`);
    }
  }

  for (const [index, item] of caseStudies.entries()) {
    const label = `caseStudies[${index}]`;
    pushMissing(errors, item.title, `${label}.title`);
    pushMissing(errors, item.shortSummary, `${label}.shortSummary`);
    pushMissing(errors, item.outcome, `${label}.outcome`);
    pushMissing(errors, item.problem, `${label}.problem`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(item.slug || ""))) {
      errors.push(`${label}.slug must be kebab-case.`);
    }
    if (!Number.isFinite(item.priority)) {
      errors.push(`${label}.priority must be a number.`);
    }
    if (item.testimonial) {
      pushMissing(errors, item.testimonial.quote, `${label}.testimonial.quote`);
      pushMissing(errors, item.testimonial.name, `${label}.testimonial.name`);
      pushMissing(errors, item.testimonial.context, `${label}.testimonial.context`);
    }
    for (const relatedSlug of item.relatedSlugs || []) {
      if (!slugSet.has(relatedSlug)) {
        errors.push(`${label}.relatedSlugs contains unknown slug "${relatedSlug}".`);
      }
    }
  }

  validateEstimateData(errors);

  if (errors.length > 0) {
    throw new Error(`Content validation failed:\n${errors.map((line) => `- ${line}`).join("\n")}`);
  }
}

function validateGeneratedPages(pages) {
  const errors = [];

  for (const page of pages) {
    const label = `page ${page.route || page.filePath}`;
    pushMissing(errors, page.title, `${label}.title`);
    pushMissing(errors, page.description, `${label}.description`);

    if (!String(page.route || "").startsWith("/")) {
      errors.push(`${label}.route must start with "/".`);
    }

    const canonical = toAbsoluteUrl(page.route);
    if (!canonical.startsWith(`${siteUrl}/`) && canonical !== `${siteUrl}/`) {
      errors.push(`${label}.canonical must stay under ${siteUrl}.`);
    }

    const ogImage = page.ogImage || `${siteUrl}/og-image.png`;
    if (!isValidUrl(ogImage)) {
      errors.push(`${label}.ogImage must be an absolute https URL.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Generated page validation failed:\n${errors.map((line) => `- ${line}`).join("\n")}`);
  }
}

async function latestModifiedDate(paths) {
  const stats = await Promise.all(paths.map((filePath) => fs.stat(filePath)));
  const newest = Math.max(...stats.map((item) => item.mtimeMs));
  return new Date(newest).toISOString().slice(0, 10);
}

async function build() {
  const pages = [
    homePage(),
    workPage(),
    writingIndexPage(),
    estimatePage(),
    hirePage(),
    experiencePage(),
    contactPage(),
    notFoundPage(),
    folderNotFoundPage(),
    ...caseStudies.map((caseStudy) => casePage(caseStudy)),
    ...notes.map((post) => writingPostPage(post)),
    ...(siteData.legacyRedirects || []).map((item) => redirectPage(item))
  ];

  validateGeneratedPages(pages);

  for (const page of pages) {
    const html = renderDocument({
      title: page.title,
      description: page.description,
      route: page.route,
      body: page.body,
      jsonLd: page.jsonLd,
      ogType: page.ogType,
      noIndex: page.noIndex,
      injectHead: page.injectHead,
      extraScripts: page.extraScripts,
      ogImage: page.ogImage,
      ogImageAlt: page.ogImageAlt,
      ogImageWidth: page.ogImageWidth,
      ogImageHeight: page.ogImageHeight
    });
    await writeTextFile(page.filePath, html);
  }

  for (const caseStudy of caseStudies) {
    await writeCaseVisualAssets(caseStudy);
  }

  await writeSitePreviewAsset();
  await writeMinifiedStylesheet();
  await writeTextFile("sitemap.xml", sitemapXml(pages));
  await writeTextFile("robots.txt", robotsTxt());
  await writeTextFile("site.webmanifest", webManifest());

  await ensureOffscanSupportFiles();
  await ensureOffscanLegacyMetadata();

  if (!isCheckMode) {
    await removeStaleCaseOutput();
    await removeLegacyTextArtifacts();
    await removeLegacyDirectories();
  }

  await validateInternalLinks();

  if (checkMismatches.size > 0) {
    const report = [...checkMismatches].map((line) => `- ${line}`).join("\n");
    throw new Error(`Generated output differs from files on disk:\n${report}`);
  }

  if (!isCheckMode) {
    console.log(`Generated ${pages.length} HTML pages.`);
    console.log(`Wrote ${writtenFiles.length} files.`);
    console.log(`Custom domain target: ${siteUrl}`);
  } else {
    console.log(`Validated ${pages.length} HTML pages with no output diffs.`);
  }
}

await build();
