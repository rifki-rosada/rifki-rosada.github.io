import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const dataPath = path.join(rootDir, "content", "site-data.json");
const isCheckMode = process.argv.includes("--check");

const rawData = await fs.readFile(dataPath, "utf8");
const data = JSON.parse(rawData.replace(/^\uFEFF/, ""));

const siteUrl = String(data.site.url || "").replace(/\/+$/, "");
if (!siteUrl.startsWith("https://")) {
  throw new Error("content/site-data.json must include an https site.url value.");
}

const today = new Date().toISOString().slice(0, 10);
const writtenFiles = [];

const knownStaticAssets = new Set([
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/favicon-192.png",
  "/favicon-512.png",
  "/og-image.png",
  "/resume.pdf",
  "/Profile.pdf",
  "/site.webmanifest",
  "/assets/css/site.css",
  "/assets/js/site.js"
]);

function ensureTrailingSlash(route) {
  if (route === "/") return "/";
  return route.endsWith("/") ? route : `${route}/`;
}

function toAbsoluteUrl(route) {
  const clean = ensureTrailingSlash(route);
  return `${siteUrl}${clean}`;
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

function renderJsonLd(payload) {
  const data = Array.isArray(payload) ? payload : [payload];
  const serialized = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${serialized}</script>`;
}

function renderHeader() {
  return `
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header" role="banner">
      <div class="container">
        <div class="header-row">
          <a class="brand" href="/" aria-label="${escapeAttribute(data.site.name)} home">
            <span class="brand-mark" aria-hidden="true"></span>
            <span>${escapeHtml(data.site.name)}</span>
          </a>
          <nav class="primary-nav" aria-label="Primary navigation">
            <a data-nav-link href="/">Home</a>
            <a data-nav-link href="/work/">Work</a>
            <a data-nav-link href="/hire/">Hire</a>
          </nav>
          <div class="header-cta">
            <a class="btn btn-secondary" href="/work/">Case Studies</a>
            <a class="btn btn-ghost" href="/hire/">Start Scope</a>
            <button class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="mobile-nav" aria-label="Toggle navigation">Menu</button>
          </div>
        </div>
        <div id="mobile-nav" class="mobile-nav" data-mobile-nav aria-hidden="true">
          <nav aria-label="Mobile navigation">
            <ul>
              <li><a data-nav-link href="/">Home</a></li>
              <li><a data-nav-link href="/work/">Work</a></li>
              <li><a data-nav-link href="/hire/">Hire</a></li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="container footer-row">
        <p>${escapeHtml(data.site.name)} | ${escapeHtml(data.site.title)} | <span data-year>${new Date().getFullYear()}</span></p>
        <div class="footer-links" aria-label="Footer links">
          <a href="mailto:${escapeAttribute(data.contact.email)}">Email</a>
          <a href="${escapeAttribute(data.contact.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <a href="${escapeAttribute(data.contact.github)}" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </div>
    </footer>
  `;
}

function renderDocument({
  title,
  description,
  route,
  ogType = "website",
  body,
  jsonLd = [],
  noIndex = false
}) {
  const canonical = toAbsoluteUrl(route);
  const keywords = Array.isArray(data.site.keywords) ? data.site.keywords.join(", ") : "";
  const robots = noIndex ? "noindex, nofollow" : "index, follow";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#102b45">
  <meta name="description" content="${escapeAttribute(description)}">
  <meta name="keywords" content="${escapeAttribute(keywords)}">
  <meta name="author" content="${escapeAttribute(data.site.name)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${escapeAttribute(canonical)}">
  <meta property="og:type" content="${escapeAttribute(ogType)}">
  <meta property="og:title" content="${escapeAttribute(title)}">
  <meta property="og:description" content="${escapeAttribute(description)}">
  <meta property="og:url" content="${escapeAttribute(canonical)}">
  <meta property="og:site_name" content="${escapeAttribute(data.site.name)}">
  <meta property="og:image" content="${escapeAttribute(`${siteUrl}/og-image.png`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeAttribute(`${data.site.name} portfolio preview`)}">
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
</head>
<body>
  ${renderHeader()}
  ${body}
  ${renderFooter()}
  <script src="/assets/js/site.js" defer></script>
</body>
</html>`;
}

function renderProofItems(items) {
  return items
    .map(
      (item, index) => `<li class="proof-item" data-animate style="--delay:${(index + 1) * 0.06}s"><strong>${index + 1}</strong><span>${escapeHtml(item)}</span></li>`
    )
    .join("");
}

function renderServiceCards(services) {
  return services
    .map(
      (service, index) => `
      <article class="card" data-animate style="--delay:${(index + 1) * 0.06}s">
        <h3>${escapeHtml(service.name)}</h3>
        <div class="meta">
          <span class="pill">${escapeHtml(service.timeline)}</span>
          <span class="pill price">Starting ${escapeHtml(service.startingPrice)}</span>
        </div>
        <ul class="deliverables">
          ${service.deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>
    `
    )
    .join("");
}

function renderCaseCard(caseStudy, index) {
  const route = `/work/${caseStudy.slug}/`;
  const delay = ((index + 1) * 0.05).toFixed(2);
  return `
    <article class="card work-card" data-animate style="--delay:${delay}s">
      <div class="meta">
        <span class="pill">${escapeHtml(caseStudy.category)}</span>
      </div>
      <h3><a href="${escapeAttribute(route)}">${escapeHtml(caseStudy.title)}</a></h3>
      <p>${escapeHtml(caseStudy.shortSummary)}</p>
      <ul class="tags">
        ${caseStudy.techStack.slice(0, 4).map((tech) => `<li>${escapeHtml(tech)}</li>`).join("")}
      </ul>
      <a class="btn btn-secondary" href="${escapeAttribute(route)}">Read case study</a>
    </article>
  `;
}

function renderContactList() {
  const items = [
    `<a href="mailto:${escapeAttribute(data.contact.email)}" aria-label="Email ${escapeAttribute(data.contact.email)}">Email: ${escapeHtml(data.contact.email)}</a>`,
    data.contact.linkedin
      ? `<a href="${escapeAttribute(data.contact.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn profile</a>`
      : "",
    data.contact.github
      ? `<a href="${escapeAttribute(data.contact.github)}" target="_blank" rel="noopener noreferrer">GitHub profile</a>`
      : ""
  ];

  if (data.contact.whatsapp) {
    items.splice(
      1,
      0,
      `<a href="${escapeAttribute(data.contact.whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp chat</a>`
    );
  } else {
    items.splice(1, 0, `<span class="muted">WhatsApp: shared on request via email or LinkedIn</span>`);
  }

  return `<div class="contact-list">${items.filter(Boolean).join("")}</div>`;
}

function homePage() {
  const featuredCases = data.caseStudies.filter((item) => item.featured).slice(0, 5);
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: data.site.name,
    url: toAbsoluteUrl("/"),
    description: data.site.heroSubheadline,
    inLanguage: "en-US"
  };

  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: data.site.name,
    url: toAbsoluteUrl("/"),
    jobTitle: data.site.title,
    email: `mailto:${data.contact.email}`,
    sameAs: [data.contact.linkedin, data.contact.github].filter(Boolean),
    knowsAbout: data.site.keywords
  };

  const body = `
    <main id="main-content">
      <section class="hero">
        <div class="container hero-grid">
          <div class="hero-card" data-animate>
            <p class="eyebrow">Remote Contract Engineer</p>
            <h1>${escapeHtml(data.site.heroHeadline)}</h1>
            <p class="subheadline">${escapeHtml(data.site.heroSubheadline)}</p>
            <p class="credibility">${escapeHtml(data.site.credibilityLine)}</p>
            <div class="actions">
              <a class="btn btn-primary" href="${escapeAttribute(data.site.heroCta.primaryHref)}">${escapeHtml(data.site.heroCta.primaryLabel)}</a>
              <a class="btn btn-secondary" href="${escapeAttribute(data.site.heroCta.secondaryHref)}">${escapeHtml(data.site.heroCta.secondaryLabel)}</a>
              <a class="btn btn-ghost" href="mailto:${escapeAttribute(data.contact.email)}">Email Direct</a>
            </div>
          </div>
          <div class="hero-side">
            <article class="metric" data-animate style="--delay:0.06s">
              <h2>Outcome-Oriented Delivery</h2>
              <p>Built for business goals first: faster sales visibility, cleaner UX flows, and reliable operations.</p>
            </article>
            <article class="metric" data-animate style="--delay:0.12s">
              <h2>Engineering Ownership</h2>
              <p>From architecture and implementation to handoff documentation and production-ready stabilization.</p>
            </article>
            <article class="metric" data-animate style="--delay:0.18s">
              <h2>Async-First Collaboration</h2>
              <p>Clear updates, scoped milestones, and communication that works across remote teams and time zones.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container panel" style="padding:1.1rem 1.2rem;">
          <h2 class="section-title">Proof of Shipped Work</h2>
          <ul class="proof-strip">
            ${renderProofItems(data.proofStrip)}
          </ul>
        </div>
      </section>

      <section class="section" aria-labelledby="services-heading">
        <div class="container">
          <h2 id="services-heading" class="section-title">Productized Services</h2>
          <p class="section-subtitle">Three focused engagement formats with clear deliverables, timelines, and starting budgets.</p>
          <div class="grid grid-3" style="margin-top:1.2rem;">
            ${renderServiceCards(data.services)}
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="selected-work-heading">
        <div class="container">
          <h2 id="selected-work-heading" class="section-title">Selected Work</h2>
          <p class="section-subtitle">Case studies focused on delivery quality and practical outcomes.</p>
          <div class="grid grid-2" style="margin-top:1.2rem;">
            ${featuredCases.map((item, index) => renderCaseCard(item, index)).join("")}
          </div>
          <div class="actions" style="margin-top:1.3rem;">
            <a class="btn btn-secondary" href="/work/">View all case studies</a>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container cta-band" data-animate>
          <h2 class="section-title">Need a dependable engineer for your next remote build?</h2>
          <p class="section-subtitle">Share your scope and constraints. I will reply with a practical plan and milestone proposal.</p>
          ${renderContactList()}
          <div class="actions">
            <a class="btn btn-primary" href="/hire/">Start a Project Scope</a>
            <a class="btn btn-secondary" href="mailto:${escapeAttribute(data.contact.email)}">Email Me</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/",
    filePath: "index.html",
    title: `${data.site.name} | ${data.site.title}`,
    description: "Conversion-focused portfolio for high-ticket remote engineering contracts: CRM systems, AI UX implementation, and automation workflows.",
    body,
    jsonLd: [websiteJsonLd, personJsonLd]
  };
}

function workPage() {
  const body = `
    <main id="main-content">
      <section class="page-hero">
        <div class="container">
          <h1 data-animate>Case Studies</h1>
          <p data-animate style="--delay:0.06s">Real project delivery across CRM systems, Android AI UX, monorepo architecture, and automation operations.</p>
        </div>
      </section>

      <section class="section" style="padding-top:0;">
        <div class="container">
          <div class="grid grid-2">
            ${data.caseStudies.map((item, index) => renderCaseCard(item, index)).join("")}
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/work/",
    filePath: path.join("work", "index.html"),
    title: `Work | ${data.site.name}`,
    description: "All portfolio case studies: CRM implementation, Android AI search UX, monorepo setup, automation workflows, and UI refinements.",
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
  const route = `/work/${caseStudy.slug}/`;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: toAbsoluteUrl("/")
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Work",
        item: toAbsoluteUrl("/work/")
      },
      {
        "@type": "ListItem",
        position: 3,
        name: caseStudy.title,
        item: toAbsoluteUrl(route)
      }
    ]
  };

  const creativeWork = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    headline: caseStudy.title,
    name: caseStudy.title,
    description: caseStudy.shortSummary,
    url: toAbsoluteUrl(route),
    dateModified: today,
    author: {
      "@type": "Person",
      name: data.site.name,
      url: toAbsoluteUrl("/")
    },
    keywords: caseStudy.techStack.join(", "),
    about: caseStudy.category
  };

  const body = `
    <main id="main-content">
      <section class="page-hero">
        <div class="container">
          <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span>/</span>
            <a href="/work/">Work</a>
            <span>/</span>
            <span>${escapeHtml(caseStudy.title)}</span>
          </nav>
          <h1 data-animate>${escapeHtml(caseStudy.title)}</h1>
          <p data-animate style="--delay:0.06s">${escapeHtml(caseStudy.shortSummary)}</p>
        </div>
      </section>

      <section class="section" style="padding-top:0;">
        <div class="container">
          <article class="case-shell" data-animate>
            <div class="case-intro">
              <div class="case-meta">
                <span class="pill">${escapeHtml(caseStudy.category)}</span>
                <span class="pill">Case Study</span>
              </div>
              <figure class="visual-placeholder" aria-label="Project visual placeholder">
                <figcaption>Public screenshot not included. This case focuses on implementation decisions and outcomes.</figcaption>
              </figure>
            </div>

            <div class="case-content">
              <section>
                <h2>Problem</h2>
                <p>${escapeHtml(caseStudy.problem)}</p>
              </section>
              <section>
                <h2>Constraints</h2>
                <ul class="bullet-list">
                  ${caseStudy.constraints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
              </section>
              <section>
                <h2>Approach</h2>
                <ul class="bullet-list">
                  ${caseStudy.approach.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
              </section>
              <section>
                <h2>Result</h2>
                <ul class="bullet-list">
                  ${caseStudy.result.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
              </section>
              <section>
                <h2>Tech Stack</h2>
                <ul class="tags" style="margin-top:0.7rem; display:flex; flex-wrap:wrap; gap:0.45rem;">
                  ${caseStudy.techStack.map((tech) => `<li class="pill">${escapeHtml(tech)}</li>`).join("")}
                </ul>
              </section>
            </div>
          </article>
        </div>
      </section>

      <section class="section">
        <div class="container cta-band" data-animate>
          <h2 class="section-title">Planning something similar?</h2>
          <p class="section-subtitle">If your team needs this type of delivery, send your scope and timeline and I will propose milestones.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/hire/">Start Scope</a>
            <a class="btn btn-secondary" href="mailto:${escapeAttribute(data.contact.email)}">Email Me</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route,
    filePath: path.join("work", caseStudy.slug, "index.html"),
    title: `${caseStudy.title} | ${data.site.name}`,
    description: caseStudy.shortSummary,
    body,
    ogType: "article",
    jsonLd: [breadcrumb, creativeWork]
  };
}

function hirePage() {
  const scopeTemplate = data.scopeTemplate.join("\n");

  const body = `
    <main id="main-content">
      <section class="page-hero">
        <div class="container">
          <h1 data-animate>Hire Me</h1>
          <p data-animate style="--delay:0.06s">Clear milestones, async communication, and delivery designed for distributed teams hiring a remote contractor.</p>
        </div>
      </section>

      <section class="section" style="padding-top:0;" aria-labelledby="process-heading">
        <div class="container">
          <h2 id="process-heading" class="section-title">How I Work</h2>
          <ul class="process-list">
            ${data.workProcess
              .map(
                (item, index) => `<li data-animate style="--delay:${(index + 1) * 0.06}s"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></li>`
              )
              .join("")}
          </ul>
        </div>
      </section>

      <section class="section" aria-labelledby="package-heading">
        <div class="container">
          <h2 id="package-heading" class="section-title">Packages</h2>
          <p class="section-subtitle">Same service packages as the homepage, plus a lightweight retainer option.</p>
          <div class="grid grid-2" style="margin-top:1.2rem;">
            ${renderServiceCards(data.services)}
            <article class="card" data-animate style="--delay:0.3s">
              <h3>${escapeHtml(data.retainer.name)}</h3>
              <div class="meta">
                <span class="pill">${escapeHtml(data.retainer.timeline)}</span>
                <span class="pill price">Starting ${escapeHtml(data.retainer.startingPrice)}</span>
              </div>
              <ul class="deliverables">
                ${data.retainer.deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="scope-template-heading">
        <div class="container">
          <h2 id="scope-template-heading" class="section-title">Scope Template</h2>
          <p class="section-subtitle">Send this structure in your first message so we can scope quickly.</p>
          <div class="scope-box" data-animate>
            <pre id="scope-template">${escapeHtml(scopeTemplate)}</pre>
          </div>
          <div class="actions" style="margin-top:1rem;">
            <button class="btn btn-primary" type="button" data-copy-scope="scope-template" data-copy-feedback="scope-feedback">Copy scope template</button>
          </div>
          <p id="scope-feedback" class="notice" role="status" aria-live="polite">Copy the template, fill each line, and send it through email or LinkedIn.</p>
        </div>
      </section>

      <section class="section">
        <div class="container cta-band" data-animate>
          <h2 class="section-title">Contact</h2>
          <p class="section-subtitle">Primary channels for project inquiries and contract discussions.</p>
          ${renderContactList()}
          <div class="actions">
            <a class="btn btn-secondary" href="mailto:${escapeAttribute(data.contact.email)}">Email</a>
            <a class="btn btn-ghost" href="${escapeAttribute(data.contact.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/hire/",
    filePath: path.join("hire", "index.html"),
    title: `Hire ${data.site.name} | Remote Contract Engineering`,
    description: "Milestone-based remote engineering packages for CRM systems, UX implementation, and automation workflow delivery.",
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Remote contract engineering",
      provider: {
        "@type": "Person",
        name: data.site.name,
        url: toAbsoluteUrl("/")
      },
      areaServed: "US and remote teams",
      availableChannel: {
        "@type": "ServiceChannel",
        serviceUrl: toAbsoluteUrl("/hire/"),
        availableLanguage: "English"
      }
    }
  };
}

function notFoundPage() {
  const body = `
    <main id="main-content">
      <section class="notice-404">
        <div class="container">
          <h1 data-animate>404 - Page Not Found</h1>
          <p data-animate style="--delay:0.06s">The page you requested is not available. Use the navigation to go back to case studies or hiring information.</p>
          <div class="actions" style="justify-content:center;">
            <a class="btn btn-primary" href="/">Go to Home</a>
            <a class="btn btn-secondary" href="/work/">View Work</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: "/404/",
    filePath: "404.html",
    title: `404 | ${data.site.name}`,
    description: "Page not found.",
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "404",
      isPartOf: toAbsoluteUrl("/")
    },
    noIndex: true
  };
}

function folderNotFoundPage() {
  const page = notFoundPage();
  return {
    ...page,
    filePath: path.join("404", "index.html")
  };
}

function redirectPage({ fromRoute, toRoute, filePath, title }) {
  const description = `Redirecting to ${toRoute}`;
  const destination = toAbsoluteUrl(toRoute);

  const body = `
    <main id="main-content">
      <section class="notice-404">
        <div class="container">
          <h1 data-animate>${escapeHtml(title)}</h1>
          <p data-animate style="--delay:0.05s">This path has moved. Continue to the updated page below.</p>
          <div class="actions" style="justify-content:center;">
            <a class="btn btn-primary" href="${escapeAttribute(toRoute)}">Open updated page</a>
          </div>
        </div>
      </section>
    </main>
  `;

  return {
    route: fromRoute,
    filePath,
    title,
    description,
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url: toAbsoluteUrl(fromRoute),
      mainEntityOfPage: destination
    },
    noIndex: true,
    injectHead: `<meta http-equiv="refresh" content="0;url=${escapeAttribute(toRoute)}">`
  };
}

function renderPage(page) {
  const html = renderDocument({
    title: page.title,
    description: page.description,
    route: page.route,
    ogType: page.ogType,
    body: page.body,
    jsonLd: page.jsonLd,
    noIndex: page.noIndex
  });

  if (!page.injectHead) return html;
  return html.replace("</head>", `  ${page.injectHead}\n</head>`);
}

async function writeFile(relativePath, content) {
  const targetPath = path.join(rootDir, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${content.trim()}\n`, "utf8");
  writtenFiles.push(relativePath.replace(/\\/g, "/"));
}

function sitemapXml(routes) {
  const urls = routes
    .filter((item) => !item.noIndex)
    .map(
      (item) => `  <url>\n    <loc>${toAbsoluteUrl(item.route)}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
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
      name: `${data.site.name} - ${data.site.title}`,
      short_name: data.site.name,
      description: data.site.heroSubheadline,
      start_url: "/",
      display: "standalone",
      background_color: "#f3f6fb",
      theme_color: "#102b45",
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

function resolveInternalTarget(pathname) {
  if (knownStaticAssets.has(pathname)) {
    return pathname;
  }

  if (pathname.endsWith("/")) {
    return `${pathname}index.html`;
  }

  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return pathname;
  }

  return `${pathname}/index.html`;
}

async function validateInternalLinks(htmlRelativeFiles) {
  const missing = [];

  for (const relativeFile of htmlRelativeFiles) {
    if (!relativeFile.endsWith(".html")) continue;
    const absoluteFile = path.join(rootDir, relativeFile.replace(/\//g, path.sep));
    const source = await fs.readFile(absoluteFile, "utf8");
    const matches = source.matchAll(/(?:href|src)=\"([^\"]+)\"/g);

    for (const match of matches) {
      const raw = match[1];
      if (!raw || raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("#") || raw.startsWith("javascript:")) {
        continue;
      }

      if (!raw.startsWith("/")) {
        continue;
      }

      const cleaned = raw.split("#")[0].split("?")[0];
      const target = resolveInternalTarget(cleaned);
      const fsTarget = path.join(rootDir, target.replace(/^\//, "").replace(/\//g, path.sep));

      try {
        await fs.access(fsTarget);
      } catch {
        missing.push({ source: relativeFile, target: cleaned });
      }
    }
  }

  if (missing.length > 0) {
    const report = missing
      .map((item) => `- ${item.source} -> ${item.target}`)
      .join("\n");
    throw new Error(`Internal link validation failed:\n${report}`);
  }
}

async function removeLegacyTextArtifacts() {
  const candidates = [
    "index.txt",
    "__next._full.txt",
    "__next._head.txt",
    "__next._index.txt",
    "__next._tree.txt",
    "__next.__PAGE__.txt",
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
    "contact/__next.contact/__PAGE__.txt"
  ];

  await Promise.all(
    candidates.map(async (relativePath) => {
      const target = path.join(rootDir, relativePath.replace(/\//g, path.sep));
      try {
        await fs.rm(target, { force: true });
      } catch {
        // ignore
      }
    })
  );
}

async function build() {
  const pages = [homePage(), workPage(), hirePage(), notFoundPage(), folderNotFoundPage()];

  data.caseStudies.forEach((caseStudy) => {
    pages.push(casePage(caseStudy));
  });

  pages.push(
    redirectPage({ fromRoute: "/projects/", toRoute: "/work/", filePath: path.join("projects", "index.html"), title: "Projects moved to Work" }),
    redirectPage({ fromRoute: "/experience/", toRoute: "/work/", filePath: path.join("experience", "index.html"), title: "Experience moved to Work" }),
    redirectPage({ fromRoute: "/contact/", toRoute: "/hire/", filePath: path.join("contact", "index.html"), title: "Contact moved to Hire" })
  );

  for (const page of pages) {
    const html = renderPage(page);
    await writeFile(page.filePath, html);
  }

  await writeFile("sitemap.xml", sitemapXml(pages));
  await writeFile("robots.txt", robotsTxt());
  await writeFile("site.webmanifest", webManifest());

  await removeLegacyTextArtifacts();
  await validateInternalLinks(pages.map((page) => page.filePath.replace(/\\/g, "/")));

  if (!isCheckMode) {
    const summary = [
      `Generated ${pages.length} HTML pages.`,
      `Wrote ${writtenFiles.length} files.`,
      `Custom domain target: ${siteUrl}`
    ];
    console.log(summary.join("\n"));
  }
}

await build();


