
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const rootDir = process.cwd();
const siteDataPath = path.join(rootDir, "content", "site-data.json");
const caseStudiesPath = path.join(rootDir, "content", "case-studies.json");
const isCheckMode = process.argv.includes("--check");

const [siteDataRaw, caseStudiesRaw] = await Promise.all([
  fs.readFile(siteDataPath, "utf8"),
  fs.readFile(caseStudiesPath, "utf8")
]);

const siteData = JSON.parse(siteDataRaw.replace(/^\uFEFF/, ""));
const caseStudiesInput = JSON.parse(caseStudiesRaw.replace(/^\uFEFF/, ""));

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

const caseStudies = caseStudiesInput
  .map((item) => ({
    ...item,
    route: `/work/${item.slug}/`
  }))
  .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
const workPreviewVisualSlugs = new Set(caseStudies.slice(0, 3).map((item) => item.slug));

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

const navItems = [
  { label: "Home", href: "/" },
  { label: "Work", href: "/work/" },
  { label: "Hire", href: "/hire/" },
  { label: "Experience", href: "/experience/" },
  { label: "Contact", href: "/contact/" }
];

const today = new Date().toISOString().slice(0, 10);
const writtenFiles = [];

function ensureTrailingSlash(route) {
  if (route === "/") return "/";
  return route.endsWith("/") ? route : `${route}/`;
}

function toAbsoluteUrl(route) {
  const normalized = ensureTrailingSlash(route);
  return `${siteUrl}${normalized}`;
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
    .replace(/\"/g, "&quot;")
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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(value, max) {
  const text = String(value);
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

function renderNavLinks(currentRoute, mobile = false) {
  return navItems
    .map((item) => {
      const active = isActiveNavLink(currentRoute, item.href) ? ' aria-current="page"' : "";
      if (mobile) {
        return `<li><a data-nav-link href="${escapeAttribute(item.href)}"${active}>${escapeHtml(item.label)}</a></li>`;
      }
      return `<a data-nav-link href="${escapeAttribute(item.href)}"${active}>${escapeHtml(item.label)}</a>`;
    })
    .join("");
}

function renderHeader(currentRoute) {
  return `
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header" role="banner">
      <div class="container header-inner">
        <a class="brand" href="/" aria-label="${escapeAttribute(siteData.site.name)} home">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-name">${escapeHtml(siteData.site.name)}</span>
        </a>
        <nav class="primary-nav" aria-label="Primary navigation">
          ${renderNavLinks(currentRoute)}
        </nav>
        <div class="header-actions">
          <a class="btn btn-primary btn-sm" href="/hire/">Hire me</a>
          <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="mobile-nav" aria-label="Open navigation menu">Menu</button>
        </div>
      </div>
      <div id="mobile-nav" class="mobile-nav" data-mobile-nav aria-hidden="true">
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
  const links = [
    { label: "Email", url: `mailto:${siteData.contact.email}` },
    { label: "LinkedIn", url: siteData.contact.linkedin },
    { label: "GitHub", url: siteData.contact.github }
  ].filter((item) => item.url);

  return `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div>
          <p class="footer-title">${escapeHtml(siteData.site.name)}</p>
          <p class="footer-copy">${escapeHtml(siteData.site.heroHeadline)}</p>
          <p class="footer-note">${escapeHtml(siteData.contact.responseTime)}</p>
        </div>
        <div>
          <p class="footer-title">Contact</p>
          <div class="footer-links" aria-label="Footer links">
            ${links
              .map((item) => {
                const external = item.url.startsWith("http");
                const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
                return `<a href="${escapeAttribute(item.url)}"${attrs}>${escapeHtml(item.label)}</a>`;
              })
              .join("")}
          </div>
        </div>
      </div>
      <div class="container footer-bottom">
        <p>(c) <span data-year>${new Date().getFullYear()}</span> ${escapeHtml(siteData.site.name)}. All rights reserved.</p>
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
  injectHead = ""
}) {
  const canonical = toAbsoluteUrl(route);
  const robots = noIndex ? "noindex, nofollow" : "index, follow";
  const keywords = Array.isArray(siteData.site.keywords) ? siteData.site.keywords.join(", ") : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="${escapeAttribute(siteData.site.themeColor || "#0a0f1e")}">
  <meta name="description" content="${escapeAttribute(description)}">
  <meta name="keywords" content="${escapeAttribute(keywords)}">
  <meta name="author" content="${escapeAttribute(siteData.site.name)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${escapeAttribute(canonical)}">
  <meta property="og:type" content="${escapeAttribute(ogType)}">
  <meta property="og:title" content="${escapeAttribute(title)}">
  <meta property="og:description" content="${escapeAttribute(description)}">
  <meta property="og:url" content="${escapeAttribute(canonical)}">
  <meta property="og:site_name" content="${escapeAttribute(siteData.site.name)}">
  <meta property="og:image" content="${escapeAttribute(`${siteUrl}/og-image.png`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeAttribute(`${siteData.site.name} portfolio preview`)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttribute(title)}">
  <meta name="twitter:description" content="${escapeAttribute(description)}">
  <meta name="twitter:image" content="${escapeAttribute(`${siteUrl}/og-image.png`)}">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16">
  <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="/favicon-192.png" sizes="192x192">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="stylesheet" href="/assets/css/site.css">
  ${renderJsonLd(jsonLd)}
  ${injectHead}
</head>
<body>
  ${renderHeader(route)}
  ${body}
  ${renderFooter()}
  <script src="/assets/js/site.js" defer></script>
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

function renderServiceCards(items, startingDelay = 0) {
  return items
    .map(
      (item, index) => `
      <article class="card service-card" data-animate style="--delay:${animationDelay(index, 0.05, startingDelay)}">
        <header>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="service-meta"><span>${escapeHtml(item.timeline)}</span><span>Starting at ${escapeHtml(item.startingPrice)}</span></p>
        </header>
        <ul class="list-dot">
          ${(item.deliverables || []).map((deliverable) => `<li>${escapeHtml(deliverable)}</li>`).join("")}
        </ul>
      </article>
    `
    )
    .join("");
}

function caseCategoryMark(category) {
  const normalized = String(category || "").toLowerCase();
  if (normalized.includes("client")) return "CL";
  if (normalized.includes("ml") || normalized.includes("edge")) return "ML";
  if (normalized.includes("automation")) return "AU";
  const words = String(category || "")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("") || "CS";
}

function renderCaseVisual(caseStudy) {
  const slug = escapeAttribute(caseStudy.slug);
  const title = escapeAttribute(caseStudy.title);
  const route = escapeAttribute(caseStudy.route);
  const hasModernFormats = workPreviewVisualSlugs.has(caseStudy.slug);

  if (!hasModernFormats) {
    return `
      <a class="case-cover-link" href="${route}" aria-label="Open case study: ${title}">
        <img src="/assets/images/cases/${slug}.svg" alt="${title} visual" loading="lazy" decoding="async" width="1200" height="675">
      </a>
    `;
  }

  return `
    <a class="case-cover-link" href="${route}" aria-label="Open case study: ${title}">
      <picture>
        <source srcset="/assets/images/cases/${slug}.avif" type="image/avif">
        <source srcset="/assets/images/cases/${slug}.webp" type="image/webp">
        <img src="/assets/images/cases/${slug}.svg" alt="${title} visual" loading="lazy" decoding="async" width="1200" height="675">
      </picture>
    </a>
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
  const { showVisual = true } = options;
  const problemLine = caseStudy.problem || caseStudy.shortSummary;
  const approachLine = (caseStudy.approach || [])[0] || caseStudy.shortSummary;
  const resultLine = caseStudy.outcome || (caseStudy.results || [])[0] || caseStudy.shortSummary;

  return `
    <article class="card case-card" data-animate style="--delay:${animationDelay(index, 0.04)}">
      ${showVisual ? renderCaseVisual(caseStudy) : renderCaseCategoryVisual(caseStudy)}
      <div class="case-content">
        <p class="case-kicker">${escapeHtml(caseStudy.category)}</p>
        <h3 class="line-clamp line-clamp-2"><a href="${escapeAttribute(caseStudy.route)}">${escapeHtml(caseStudy.title)}</a></h3>
        <ul class="case-summary">
          <li><span class="case-summary-label">Problem</span><p class="line-clamp line-clamp-2">${escapeHtml(problemLine)}</p></li>
          <li><span class="case-summary-label">What I did</span><p class="line-clamp line-clamp-2">${escapeHtml(approachLine)}</p></li>
          <li><span class="case-summary-label">Result</span><p class="line-clamp line-clamp-2">${escapeHtml(resultLine)}</p></li>
        </ul>
        <p class="case-outcome line-clamp line-clamp-2">${escapeHtml(caseStudy.shortSummary)}</p>
        <ul class="stack-list">
          ${(caseStudy.techStack || []).slice(0, 5).map((tech) => `<li>${escapeHtml(tech)}</li>`).join("")}
        </ul>
        <a class="btn btn-secondary btn-read" href="${escapeAttribute(caseStudy.route)}">Read case study</a>
      </div>
    </article>
  `;
}

function renderContactChannels() {
  const links = [
    { label: `Email (${siteData.contact.email})`, href: `mailto:${siteData.contact.email}` },
    { label: "LinkedIn", href: siteData.contact.linkedin },
    { label: "GitHub", href: siteData.contact.github }
  ].filter((item) => item.href);

  if (siteData.contact.whatsapp) {
    links.splice(1, 0, { label: "WhatsApp", href: siteData.contact.whatsapp });
  }

  return `
    <ul class="contact-list">
      ${links
        .map((item) => {
          const external = item.href.startsWith("http");
          const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
          return `<li><a href="${escapeAttribute(item.href)}"${attrs}>${escapeHtml(item.label)}</a></li>`;
        })
        .join("")}
    </ul>
  `;
}
function homePage() {
  const featuredCases = (siteData.featuredCaseSlugs || [])
    .map((slug) => caseStudies.find((item) => item.slug === slug))
    .filter(Boolean)
    .slice(0, 5);

  const selectedCases = featuredCases.length > 0 ? featuredCases : caseStudies.slice(0, 5);

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

  const body = `
    <main id="main-content">
      <section class="hero section">
        <div class="container hero-grid">
          <div class="hero-main" data-animate>
            <p class="eyebrow">Remote Contract Engineer</p>
            <h1>${escapeHtml(siteData.site.heroHeadline)}</h1>
            <p class="lead">${escapeHtml(siteData.site.heroSubheadline)}</p>
            <div class="actions">
              <a class="btn btn-primary" href="${escapeAttribute(siteData.site.heroPrimaryCta.href)}">${escapeHtml(siteData.site.heroPrimaryCta.label)}</a>
              <a class="btn btn-secondary" href="${escapeAttribute(siteData.site.heroSecondaryCta.href)}">${escapeHtml(siteData.site.heroSecondaryCta.label)}</a>
            </div>
          </div>
          <aside class="hero-panel" data-animate style="--delay:0.08s" aria-label="Positioning and proof summary">
            <h2>Outcome-first engineering</h2>
            <p>I focus on shipping systems that reduce manual work, stabilize UX, and support clear operational decisions.</p>
            <p class="mini-proof">${escapeHtml(siteData.contact.responseTime)}</p>
          </aside>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="proof-heading">
        <div class="container panel">
          <h2 id="proof-heading">Proof of delivery</h2>
          <ul class="proof-strip">
            ${renderProofStrip(siteData.proofStrip || [])}
          </ul>
        </div>
      </section>

      <section class="section" aria-labelledby="services-heading">
        <div class="container">
          <h2 id="services-heading">Services</h2>
          <p class="section-intro">Productized offers with clear deliverables, timeline, and starting price range.</p>
          <div class="grid grid-3 cards-equal">
            ${renderServiceCards(siteData.services || [])}
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="selected-work-heading">
        <div class="container">
          <h2 id="selected-work-heading">Selected work</h2>
          <p class="section-intro">Client-delivery case studies prioritized by business outcomes.</p>
          <div class="grid case-grid case-grid-featured">
            ${selectedCases.map((item, index) => renderCaseCard(item, index, { showVisual: true })).join("")}
          </div>
          <div class="actions actions-inline">
            <a class="btn btn-secondary" href="/work/">View all work</a>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="trust-heading">
        <div class="container trust-grid">
          <div class="card" data-animate>
            <h2 id="trust-heading">Trust and credibility</h2>
            <ul class="list-dot">
              ${(siteData.trust?.credibility || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
          <div class="card" data-animate style="--delay:0.06s">
            <h3>Core stack</h3>
            <ul class="stack-list large">
              ${(siteData.trust?.stack || []).map((stack) => `<li>${escapeHtml(stack)}</li>`).join("")}
            </ul>
            <h3 class="links-title">Profiles</h3>
            <div class="profile-links">
              ${(siteData.trust?.profiles || [])
                .map(
                  (item) =>
                    `<a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`
                )
                .join("")}
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Need a reliable engineer for your remote build?</h2>
          <p>Send scope and constraints. I will reply with a milestone plan you can execute immediately.</p>
          ${renderContactChannels()}
          <div class="actions">
            <a class="btn btn-primary" href="/hire/">Hire me</a>
            <a class="btn btn-secondary" href="mailto:${escapeAttribute(siteData.contact.email)}">Email direct</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/",
    filePath: "index.html",
    title: `${siteData.site.name} | ${siteData.site.title}`,
    description:
      "Android + AI engineer portfolio focused on production AI chat/search UX, custom CRM systems, and automation workflows for remote contracts.",
    body,
    jsonLd: [websiteJsonLd, personJsonLd]
  };
}

function workPage() {
  const body = `
    <main id="main-content">
      <section class="page-hero section">
        <div class="container">
          <h1 data-animate>Work</h1>
          <p data-animate style="--delay:0.05s">Case studies covering client delivery and ML/edge product work, ordered by business impact priority.</p>
        </div>
      </section>
      <section class="section section-tight" aria-labelledby="work-grid-heading">
        <div class="container">
          <h2 id="work-grid-heading" class="sr-only">All case studies</h2>
          <div class="grid case-grid case-grid-work">
            ${caseStudies
              .map((item, index) => renderCaseCard(item, index, { showVisual: index < 3 }))
              .join("")}
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/work/",
    filePath: path.join("work", "index.html"),
    title: `Work | ${siteData.site.name}`,
    description:
      "Case studies: custom CRM delivery, Android AI chat/search UX, automation workflows, monorepo architecture, UI fixes, and ML/edge builds.",
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Work case studies",
      url: toAbsoluteUrl("/work/"),
      isPartOf: toAbsoluteUrl("/")
    }
  };
}

function casePage(caseStudy) {
  const isClientCase = caseStudy.type === "client";
  const ndaLead = isClientCase
    ? "Client details withheld. Implementation proof available under NDA."
    : "Public project details. No client-sensitive data disclosed.";
  const caseRole = caseStudy.role || (isClientCase ? "Remote Contract Engineer" : "Product Engineer");
  const caseTimeline = caseStudy.timeline || (isClientCase ? "Scoped delivery sprint" : "Prototype and validation cycle");
  const keyOutcomes = (caseStudy.results || []).slice(0, 3);
  const caseSnapshotBullets = Array.from(
    new Set([
      ...(caseStudy.constraints || []).slice(0, 2),
      ...(caseStudy.results || []).slice(0, 1),
      ...(caseStudy.approach || []).slice(0, 1)
    ].filter(Boolean))
  ).slice(0, 3);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: toAbsoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Work", item: toAbsoluteUrl("/work/") },
      { "@type": "ListItem", position: 3, name: caseStudy.title, item: toAbsoluteUrl(caseStudy.route) }
    ]
  };

  const creativeWorkJsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: caseStudy.title,
    description: caseStudy.shortSummary,
    dateModified: today,
    creator: {
      "@type": "Person",
      name: siteData.site.name,
      url: toAbsoluteUrl("/")
    },
    url: toAbsoluteUrl(caseStudy.route),
    about: caseStudy.category,
    keywords: (caseStudy.techStack || []).join(", ")
  };

  const body = `
    <main id="main-content">
      <section class="page-hero section">
        <div class="container">
          <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span>/</span>
            <a href="/work/">Work</a>
            <span>/</span>
            <span>${escapeHtml(caseStudy.title)}</span>
          </nav>
          <h1 data-animate>${escapeHtml(caseStudy.title)}</h1>
          <p data-animate style="--delay:0.05s">${escapeHtml(caseStudy.shortSummary)}</p>
          <div class="case-snapshot" data-animate style="--delay:0.1s">
            <p class="case-snapshot-problem line-clamp line-clamp-3"><strong>Problem:</strong> ${escapeHtml(caseStudy.problem)}</p>
            <ul class="list-dot case-snapshot-list">
              ${(caseSnapshotBullets.length ? caseSnapshotBullets : [caseStudy.outcome || caseStudy.shortSummary])
                .map((item) => `<li class="line-clamp line-clamp-2">${escapeHtml(item)}</li>`)
                .join("")}
            </ul>
          </div>
        </div>
      </section>

      <section class="section section-tight">
        <div class="container case-layout">
          <aside class="card case-glance" data-animate>
            <h2>At a glance</h2>
            <dl class="glance-list">
              <div>
                <dt>Role</dt>
                <dd>${escapeHtml(caseRole)}</dd>
              </div>
              <div>
                <dt>Timeline</dt>
                <dd>${escapeHtml(caseTimeline)}</dd>
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
                    ${(keyOutcomes.length ? keyOutcomes : [caseStudy.outcome || caseStudy.shortSummary])
                      .map((item) => `<li>${escapeHtml(item)}</li>`)
                      .join("")}
                  </ul>
                </dd>
              </div>
            </dl>
            <p class="nda-note">${escapeHtml(ndaLead)}</p>
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
              <h2>Approach</h2>
              <ul class="list-dot">
                ${(caseStudy.approach || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
            <section>
              <h2>Results</h2>
              <ul class="list-dot">
                ${(caseStudy.results || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>
            <section>
              <h2>Tech stack</h2>
              <ul class="stack-list large">
                ${(caseStudy.techStack || []).map((tech) => `<li>${escapeHtml(tech)}</li>`).join("")}
              </ul>
            </section>
          </article>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Planning a similar project?</h2>
          <p>Share your goals, constraints, and timeline. I will return a practical milestone proposal.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/hire/">Hire me</a>
            <a class="btn btn-secondary" href="mailto:${escapeAttribute(siteData.contact.email)}">Email direct</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: caseStudy.route,
    filePath: path.join("work", caseStudy.slug, "index.html"),
    title: `${caseStudy.title} | ${siteData.site.name}`,
    description: caseStudy.shortSummary,
    body,
    ogType: "article",
    jsonLd: [breadcrumbJsonLd, creativeWorkJsonLd]
  };
}
function hirePage() {
  const introTemplate = (siteData.introTemplate || []).join("\n");
  const scopeTemplate = (siteData.scopeTemplate || []).join("\n");

  const body = `
    <main id="main-content">
      <section class="page-hero section">
        <div class="container">
          <h1 data-animate>Hire me</h1>
          <p data-animate style="--delay:0.05s">Packages, milestones, and communication designed for high-trust remote contracts.</p>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="packages-heading">
        <div class="container">
          <h2 id="packages-heading">Packages</h2>
          <p class="section-intro">Same productized services from home, plus a retainer option for ongoing execution.</p>
          <div class="grid grid-2 cards-equal">
            ${renderServiceCards(siteData.services || [])}
            <article class="card service-card" data-animate style="--delay:0.22s">
              <header>
                <h3>${escapeHtml(siteData.retainer.name)}</h3>
                <p class="service-meta"><span>${escapeHtml(siteData.retainer.timeline)}</span><span>Starting at ${escapeHtml(siteData.retainer.startingPrice)}</span></p>
              </header>
              <ul class="list-dot">
                ${(siteData.retainer.deliverables || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="process-heading">
        <div class="container">
          <h2 id="process-heading">How I work</h2>
          <ul class="process-grid">
            ${(siteData.workProcess || [])
              .map(
                (item, index) => `
                <li class="card" data-animate style="--delay:${animationDelay(index, 0.05)}">
                  <h3>${escapeHtml(item.title)}</h3>
                  <p>${escapeHtml(item.detail)}</p>
                </li>
              `
              )
              .join("")}
          </ul>
        </div>
      </section>

      <section class="section" aria-labelledby="copy-tools-heading">
        <div class="container">
          <h2 id="copy-tools-heading">Fast-start copy tools</h2>
          <p class="section-intro">Use these templates so we can scope quickly.</p>
          <div class="grid grid-2 copy-grid">
            <article class="card copy-card" data-animate>
              <h3>Intro message</h3>
              <pre id="intro-message">${escapeHtml(introTemplate)}</pre>
              <button class="btn btn-secondary" type="button" data-copy-target="intro-message" data-copy-feedback="intro-feedback">Copy intro message</button>
              <p id="intro-feedback" class="copy-feedback" role="status" aria-live="polite">Copy and customize this intro before sending.</p>
            </article>
            <article class="card copy-card" data-animate style="--delay:0.08s">
              <h3>Scope template</h3>
              <pre id="scope-template">${escapeHtml(scopeTemplate)}</pre>
              <button class="btn btn-secondary" type="button" data-copy-target="scope-template" data-copy-feedback="scope-feedback">Copy scope template</button>
              <p id="scope-feedback" class="copy-feedback" role="status" aria-live="polite">Fill each line to speed up scoping and estimation.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Contact</h2>
          <p>${escapeHtml(siteData.contact.responseTime)}</p>
          ${renderContactChannels()}
          <div class="actions">
            <a class="btn btn-primary" href="/contact/">Hire me</a>
            <a class="btn btn-secondary" href="mailto:${escapeAttribute(siteData.contact.email)}">Email scope</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/hire/",
    filePath: path.join("hire", "index.html"),
    title: `Hire ${siteData.site.name} | ${siteData.site.title}`,
    description:
      "Hire an Android + AI engineer for AI chat/search UX, CRM/internal tools, and automation workflows with milestone-based delivery.",
    body,
    jsonLd: {
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
      availableChannel: {
        "@type": "ServiceChannel",
        serviceUrl: toAbsoluteUrl("/hire/"),
        availableLanguage: "English"
      }
    }
  };
}

function experiencePage() {
  const body = `
    <main id="main-content">
      <section class="page-hero section">
        <div class="container">
          <h1 data-animate>Experience</h1>
          <p data-animate style="--delay:0.05s">Hands-on delivery across internships and remote contracts, focused on practical shipping and reliability.</p>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="experience-list-heading">
        <div class="container">
          <h2 id="experience-list-heading">Roles and highlights</h2>
          <div class="grid grid-2 cards-equal">
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
          <h2>Need execution support for an active roadmap?</h2>
          <p>I can slot into scoped milestones and ship with clear handoff docs.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/hire/">Hire me</a>
            <a class="btn btn-secondary" href="/work/">Review case studies</a>
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
      "Experience summary: internship and remote contract work across Android, AI UX, full-stack systems, and automation delivery.",
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
  const scopeMailSubject = "Project scope inquiry";
  const scopeMailBody = [
    "Hi Rifki,",
    "",
    "I would like to discuss this project:",
    "",
    ...(siteData.scopeTemplate || []),
    "",
    "Target launch date:",
    "Budget range:",
    "",
    "Best,"
  ].join("\n");
  const scopeMailHref = `mailto:${siteData.contact.email}?subject=${encodeURIComponent(scopeMailSubject)}&body=${encodeURIComponent(scopeMailBody)}`;

  const channelCards = [
    { label: "Email", value: siteData.contact.email, href: `mailto:${siteData.contact.email}` },
    { label: "LinkedIn", value: "Open profile", href: siteData.contact.linkedin },
    { label: "GitHub", value: "View repositories", href: siteData.contact.github }
  ];

  if (siteData.contact.whatsapp) {
    channelCards.splice(1, 0, { label: "WhatsApp", value: "Open chat", href: siteData.contact.whatsapp });
  }

  const body = `
    <main id="main-content">
      <section class="page-hero section">
        <div class="container">
          <h1 data-animate>Contact</h1>
          <p data-animate style="--delay:0.05s">Share project scope, timeline, and constraints. ${escapeHtml(siteData.contact.responseTime)}</p>
          <div class="actions" data-animate style="--delay:0.1s">
            <button class="btn btn-secondary" type="button" data-copy-target="contact-scope-template-quick" data-copy-feedback="contact-scope-quick-feedback">Copy scope template</button>
            <a class="btn btn-secondary" href="${escapeAttribute(scopeMailHref)}">Email scope template</a>
          </div>
          <p id="contact-scope-quick-feedback" class="copy-feedback" role="status" aria-live="polite">Paste the template, add details, then send.</p>
          <pre id="contact-scope-template-quick" class="sr-only-copy-source">${escapeHtml(scopeTemplate)}</pre>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="channel-heading">
        <div class="container">
          <h2 id="channel-heading">Direct channels</h2>
          <div class="grid grid-2 cards-equal">
            ${channelCards
              .map((item, index) => {
                const external = item.href.startsWith("http");
                const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
                return `
                <article class="card" data-animate style="--delay:${animationDelay(index, 0.05)}">
                  <h3>${escapeHtml(item.label)}</h3>
                  <p>${escapeHtml(item.value)}</p>
                  <a class="text-link" href="${escapeAttribute(item.href)}"${attrs}>Open ${escapeHtml(item.label)}</a>
                </article>
              `;
              })
              .join("")}
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="contact-template-heading">
        <div class="container">
          <h2 id="contact-template-heading">Scope template and response flow</h2>
          <p class="section-intro">Use one of these templates. Scope-first messages are prioritized.</p>
          <div class="grid grid-2 copy-grid">
            <article class="card copy-card" data-animate>
              <h3>Intro message</h3>
              <pre id="contact-intro-template">${escapeHtml(introTemplate)}</pre>
              <button class="btn btn-secondary" type="button" data-copy-target="contact-intro-template" data-copy-feedback="contact-intro-feedback">Copy intro message</button>
              <p id="contact-intro-feedback" class="copy-feedback" role="status" aria-live="polite">This format helps me return a faster first response.</p>
            </article>
            <article class="card copy-card" data-animate style="--delay:0.08s">
              <h3>Scope template</h3>
              <pre id="contact-scope-template">${escapeHtml(scopeTemplate)}</pre>
              <button class="btn btn-secondary" type="button" data-copy-target="contact-scope-template" data-copy-feedback="contact-scope-feedback">Copy scope template</button>
              <p id="contact-scope-feedback" class="copy-feedback" role="status" aria-live="polite">Include timeline + definition of done for an accurate proposal.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <h2>Ready to start?</h2>
          <p>For scoped contract work, the fastest path is sharing your requirements through email or LinkedIn.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/hire/">Hire me</a>
            <a class="btn btn-secondary" href="${escapeAttribute(scopeMailHref)}">Send scoped email</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/contact/",
    filePath: path.join("contact", "index.html"),
    title: `Contact | ${siteData.site.name}`,
    description:
      "Contact page with direct channels, response time, and copy-ready templates for project scoping.",
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
    <main id="main-content">
      <section class="section notice-404">
        <div class="container" data-animate>
          <h1>404 - Page not found</h1>
          <p>This page is unavailable. Use navigation or jump to work and hiring details.</p>
          <div class="actions actions-center">
            <a class="btn btn-secondary" href="/">Go home</a>
            <a class="btn btn-secondary" href="/work/">View work</a>
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
    <main id="main-content">
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
  const title = truncate(caseStudy.title, 44);
  const outcome = truncate(caseStudy.outcome || caseStudy.shortSummary, 88);
  const techLine = truncate((caseStudy.techStack || []).slice(0, 4).join(" | "), 72);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(caseStudy.title)}</title>
  <desc id="desc">${escapeXml(caseStudy.visualCaption || "Case study visual")}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172f"/>
      <stop offset="50%" stop-color="#111a36"/>
      <stop offset="100%" stop-color="#0a1024"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#44d2ff"/>
      <stop offset="100%" stop-color="#7d7bff"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect x="72" y="70" width="1056" height="535" rx="22" fill="none" stroke="rgba(127,163,255,0.32)" stroke-width="2"/>

  <rect x="120" y="148" width="380" height="160" rx="16" fill="rgba(31,52,94,0.72)" stroke="rgba(116,162,255,0.55)"/>
  <rect x="540" y="148" width="230" height="160" rx="16" fill="rgba(27,69,95,0.72)" stroke="rgba(116,162,255,0.55)"/>
  <rect x="820" y="148" width="260" height="160" rx="16" fill="rgba(34,67,120,0.72)" stroke="rgba(116,162,255,0.55)"/>

  <path d="M500 228h40" stroke="url(#accent)" stroke-width="5" stroke-linecap="round"/>
  <path d="M770 228h50" stroke="url(#accent)" stroke-width="5" stroke-linecap="round"/>

  <text x="120" y="380" fill="#7dd7ff" font-size="24" font-family="'Segoe UI', Tahoma, sans-serif">${escapeXml(caseStudy.category)}</text>
  <text x="120" y="430" fill="#f0f5ff" font-size="42" font-family="'Segoe UI', Tahoma, sans-serif" font-weight="700">${escapeXml(title)}</text>
  <text x="120" y="480" fill="#b8c7e8" font-size="24" font-family="'Segoe UI', Tahoma, sans-serif">${escapeXml(outcome)}</text>
  <text x="120" y="534" fill="#8fb7ff" font-size="22" font-family="'Segoe UI', Tahoma, sans-serif">${escapeXml(techLine)}</text>
</svg>`;
}

async function writeCaseVisualAssets(caseStudy) {
  const svgMarkup = caseVisualSvg(caseStudy);
  const basePath = path.join("assets", "images", "cases");
  await writeTextFile(path.join(basePath, `${caseStudy.slug}.svg`), svgMarkup);

  if (!workPreviewVisualSlugs.has(caseStudy.slug)) {
    return;
  }

  const svgBuffer = Buffer.from(svgMarkup, "utf8");
  const resizeConfig = {
    width: 1200,
    height: 675,
    fit: "cover"
  };

  const webpBuffer = await sharp(svgBuffer, { density: 220 })
    .resize(resizeConfig)
    .webp({ quality: 78, effort: 5 })
    .toBuffer();
  const avifBuffer = await sharp(svgBuffer, { density: 220 })
    .resize(resizeConfig)
    .avif({ quality: 58, effort: 6 })
    .toBuffer();

  await writeBinaryFile(path.join(basePath, `${caseStudy.slug}.webp`), webpBuffer);
  await writeBinaryFile(path.join(basePath, `${caseStudy.slug}.avif`), avifBuffer);
}

function sitemapXml(pages) {
  const entries = pages
    .filter((page) => !page.noIndex)
    .map(
      (page) => `  <url>\n    <loc>${toAbsoluteUrl(page.route)}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`
    )
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
      background_color: "#070b18",
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

async function writeTextFile(relativePath, content) {
  const targetPath = path.join(rootDir, relativePath);
  const normalized = content
    .trim()
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${normalized}\n`, "utf8");
  writtenFiles.push(relativePath.replace(/\\/g, "/"));
}

async function writeBinaryFile(relativePath, content) {
  const targetPath = path.join(rootDir, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content);
  writtenFiles.push(relativePath.replace(/\\/g, "/"));
}

async function writeBinaryCopy(sourceRelativePath, targetRelativePath) {
  const source = path.join(rootDir, sourceRelativePath);
  const target = path.join(rootDir, targetRelativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  writtenFiles.push(targetRelativePath.replace(/\\/g, "/"));
}

function normalizeFilePathSlashes(value) {
  return value.replace(/\\/g, "/");
}

async function removeLegacyTextArtifacts() {
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
      const target = path.join(rootDir, candidate.replace(/\//g, path.sep));
      try {
        await fs.rm(target, { force: true });
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
        .map((entry) =>
          fs.rm(path.join(rootDir, "work", entry.name), {
            recursive: true,
            force: true
          })
        )
    );
  } catch {
    // ignore
  }

  const keepCaseImages = new Set();
  for (const item of caseStudies) {
    keepCaseImages.add(`${item.slug}.svg`);
    if (workPreviewVisualSlugs.has(item.slug)) {
      keepCaseImages.add(`${item.slug}.webp`);
      keepCaseImages.add(`${item.slug}.avif`);
    }
  }

  const removableExtensions = new Set([".svg", ".webp", ".avif"]);
  try {
    const imageEntries = await fs.readdir(path.join(rootDir, "assets", "images", "cases"), {
      withFileTypes: true
    });
    await Promise.all(
      imageEntries
        .filter(
          (entry) =>
            entry.isFile() &&
            removableExtensions.has(path.extname(entry.name.toLowerCase())) &&
            !keepCaseImages.has(entry.name)
        )
        .map((entry) =>
          fs.rm(path.join(rootDir, "assets", "images", "cases", entry.name), { force: true })
        )
    );
  } catch {
    // ignore
  }
}

async function removeLegacyDirectories() {
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
      body: `<p>For help with OffScan AI, contact: <a href=\"mailto:${escapeAttribute(siteData.contact.email)}\">${escapeHtml(siteData.contact.email)}</a></p><p>Include your device model, Android version, and issue summary for faster troubleshooting.</p>`
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
    body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #060b17; color: #e6ecff; }
    main { max-width: 740px; margin: 0 auto; padding: 3rem 1rem 4rem; line-height: 1.6; }
    a { color: #7dcfff; }
    h1 { line-height: 1.2; margin-top: 0; }
    .back { margin-top: 2rem; display: inline-flex; color: #9ac3ff; }
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

async function collectHtmlFiles(startDir, list = []) {
  const entries = await fs.readdir(startDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") continue;
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
  if (targetPath.endsWith("/")) {
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
    const matches = source.matchAll(/(?:href|src)=\"([^\"]+)\"/g);

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

async function build() {
  const pages = [
    homePage(),
    workPage(),
    hirePage(),
    experiencePage(),
    contactPage(),
    notFoundPage(),
    folderNotFoundPage(),
    ...caseStudies.map((caseStudy) => casePage(caseStudy)),
    ...(siteData.legacyRedirects || []).map((item) => redirectPage(item))
  ];

  for (const page of pages) {
    const html = renderDocument({
      title: page.title,
      description: page.description,
      route: page.route,
      body: page.body,
      jsonLd: page.jsonLd,
      ogType: page.ogType,
      noIndex: page.noIndex,
      injectHead: page.injectHead
    });
    await writeTextFile(page.filePath, html);
  }

  for (const caseStudy of caseStudies) {
    await writeCaseVisualAssets(caseStudy);
  }

  await removeStaleCaseOutput();

  await writeTextFile("sitemap.xml", sitemapXml(pages));
  await writeTextFile("robots.txt", robotsTxt());
  await writeTextFile("site.webmanifest", webManifest());

  await ensureOffscanSupportFiles();
  await removeLegacyTextArtifacts();
  await removeLegacyDirectories();
  await validateInternalLinks();

  if (!isCheckMode) {
    console.log(`Generated ${pages.length} HTML pages.`);
    console.log(`Wrote ${writtenFiles.length} files.`);
    console.log(`Custom domain target: ${siteUrl}`);
  }
}

await build();

