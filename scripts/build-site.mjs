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

const buildDate = await latestModifiedDate([
  siteDataPath,
  caseStudiesPath,
  path.join(rootDir, "scripts", "build-site.mjs"),
  path.join(rootDir, "assets", "css", "site.css"),
  path.join(rootDir, "assets", "js", "site.js")
]);

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

const navItems = [
  { label: "Home", href: "/" },
  { label: "Work", href: "/work/" },
  { label: "Hire", href: "/hire/" },
  { label: "Contact", href: "/contact/" }
];

const footerNavItems = [...navItems, { label: "Experience", href: "/experience/" }];
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
  return footerNavItems.map((item) => `<a href="${escapeAttribute(item.href)}">${escapeHtml(item.label)}</a>`).join("");
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
          <a class="btn btn-primary btn-sm" href="${escapeAttribute(siteData.site.heroPrimaryCta.href)}">${escapeHtml(siteData.site.heroPrimaryCta.label)}</a>
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
        <div>
          <p class="footer-title">Explore</p>
          <div class="footer-nav">
            ${renderFooterNavLinks()}
          </div>
        </div>
      </div>
      <div class="container footer-bottom">
        <p>(c) ${new Date(buildDate).getUTCFullYear()} ${escapeHtml(siteData.site.name)}. All rights reserved.</p>
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
  ogImage = `${siteUrl}/og-image.png`,
  ogImageAlt = `${siteData.site.name} portfolio preview`
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
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
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

function renderCaseVisual(caseStudy, loading = "lazy") {
  const slug = escapeAttribute(caseStudy.slug);

  return `
    <picture>
      <source srcset="/assets/images/cases/${slug}.avif" type="image/avif">
      <source srcset="/assets/images/cases/${slug}.webp" type="image/webp">
      <img src="/assets/images/cases/${slug}.png" alt="" loading="${escapeAttribute(loading)}" decoding="async" width="1200" height="675">
    </picture>
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

function renderContactChannels() {
  const links = [
    { label: `Email (${siteData.contact.email})`, href: emailProjectBriefHref() },
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
            <div class="hero-links">
              <a class="text-link" href="${escapeAttribute(emailProjectBriefHref())}">Email project brief</a>
              <a class="text-link" href="/hire/">See engagement options</a>
            </div>
          </div>
          <aside class="hero-panel" data-animate style="--delay:0.08s" aria-label="Positioning and proof summary">
            <p class="eyebrow eyebrow-muted">Primary focus</p>
            <h2>Internal tools, automation, and reliable remote delivery</h2>
            <ul class="list-dot list-dot-tight">
              <li>Best fit for workflow-heavy teams that need clearer operating systems.</li>
              <li>Android + AI stays visible as a secondary specialization, not the whole story.</li>
              <li>${escapeHtml(siteData.contact.responseTime)}</li>
            </ul>
          </aside>
        </div>
      </section>

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
            <a class="btn btn-secondary" href="/contact/">Share your scope</a>
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
            <a class="btn btn-secondary" href="/contact/">Share your scope</a>
          </div>
        </div>
      </section>

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
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-panel" data-animate>
          <p class="eyebrow">Remote contract engineering</p>
          <h2>Need a reliable engineer for an active workflow or product build?</h2>
          <p>Share the current process, blockers, and timeline. I will reply with the best starting scope.</p>
          ${renderContactChannels()}
          <div class="actions">
            <a class="btn btn-primary" href="/contact/">Share your scope</a>
            <a class="btn btn-secondary" href="${escapeAttribute(emailProjectBriefHref())}">Email project brief</a>
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
            <a class="btn btn-primary" href="/contact/">Share your scope</a>
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
          <p>Share the current state and target outcome. I will reply with the best next step for a scoped remote contract.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/contact/">Share your scope</a>
            <a class="btn btn-secondary" href="${escapeAttribute(emailProjectBriefHref())}">Email project brief</a>
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
              <h2>Delivery</h2>
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
          <h2>Planning a similar build?</h2>
          <p>Share the workflow, delivery risk, and timeline. I will reply with the best starting scope.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/contact/">Share your scope</a>
            <a class="btn btn-secondary" href="${escapeAttribute(emailProjectBriefHref())}">Email project brief</a>
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
          <div class="actions" data-animate style="--delay:0.12s">
            <a class="btn btn-primary" href="/contact/">Share your scope</a>
            <a class="btn btn-secondary" href="${escapeAttribute(emailProjectBriefHref())}">Email project brief</a>
          </div>
        </div>
      </section>

      <section class="section section-tight" aria-labelledby="packages-heading">
        <div class="container">
          <div class="section-head">
            <h2 id="packages-heading">Engagement options</h2>
            <p>Clear paths for internal tools, automation systems, Android + AI delivery, and ongoing remote execution.</p>
          </div>
          <div class="grid grid-2">
            ${renderServiceCards(packages)}
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
            <a class="btn btn-primary" href="/contact/">Share your scope</a>
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
          <p class="sla-note" data-animate style="--delay:0.12s"><strong>Response:</strong> ${escapeHtml(siteData.contact.responseTime)}</p>
          <div class="actions" data-animate style="--delay:0.16s">
            <a class="btn btn-primary" href="${escapeAttribute(scopeMailHref())}">Email project brief</a>
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
          <p>Email the project brief directly, or review the engagement options first if you want to see how the work is usually scoped.</p>
          <div class="actions">
            <a class="btn btn-primary" href="${escapeAttribute(scopeMailHref())}">Email project brief</a>
            <a class="btn btn-secondary" href="/hire/">See engagement options</a>
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

async function latestModifiedDate(paths) {
  const stats = await Promise.all(paths.map((filePath) => fs.stat(filePath)));
  const newest = Math.max(...stats.map((item) => item.mtimeMs));
  return new Date(newest).toISOString().slice(0, 10);
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
      injectHead: page.injectHead,
      ogImage: page.ogImage,
      ogImageAlt: page.ogImageAlt
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
