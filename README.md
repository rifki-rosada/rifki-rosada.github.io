# Rifki Rosada Portfolio

High-conversion static portfolio for GitHub Pages + custom domain deployment (`rifkirosada.com`).

## Audit Summary (Current Stack)

- Build system: custom Node static generator (`scripts/build-site.mjs`)
- Runtime framework: none (pre-rendered HTML/CSS/JS)
- Content model:
  - `content/site-data.json`
  - `content/case-studies.json`
  - `content/estimate.json`
- Shared assets:
  - `assets/css/site.css`
  - `assets/js/site.js`
  - `assets/images/cases/*.svg`
- Deployment style: committed static output from repository root
- GitHub Pages compatibility preserved:
  - `CNAME` (custom domain)
  - `.nojekyll`

## Generated Pages

- `/` Home
- `/work/`
- `/work/<slug>/` case details
- `/estimate/`
- `/hire/`
- `/experience/`
- `/contact/`
- `404.html` and `/404/`
- Legacy redirect:
  - `/projects/` -> `/work/`

## SEO and Indexing Output

Generated during build:

- per-page `<title>` + meta description
- canonical URLs (`https://rifkirosada.com/...`)
- OpenGraph + Twitter card metadata
- JSON-LD
  - Home: `WebSite` + `Person`
  - Case pages: `BreadcrumbList` + `Article`
- `sitemap.xml`
- `robots.txt`
- `site.webmanifest`

## Local Development

### Requirements

- Node.js 18+

### Commands

- Build site:
  - `npm run build`
- Validate (same generator in check mode):
  - `npm run check`
- Lint alias:
  - `npm run lint`

### Estimate Content and Webhook

The estimator page is generated from `content/estimate.json`. Questions, pricing, proof items, scoring labels, result copy, SEO text, and the fallback email belong there so builds stay deterministic.

Submissions are client-side. To send leads to a Google Apps Script web app, set `ESTIMATE_WEBHOOK_URL` during build or update `content/site-data.json` -> `estimate.webhookEndpoint` with a public, rotatable endpoint.

Do not commit private credentials, Apps Script secrets, Google Sheet URLs, or a local `.env`. The default repo value is blank and the page keeps a mailto fallback when no endpoint is configured.

## Where to Edit Content

- Global site settings, services, process, contact, experience:
  - `content/site-data.json`
- Case study cards + detail content:
  - `content/case-studies.json`
- Estimator questions, pricing, proof, scoring, SEO, and fallback email:
  - `content/estimate.json`

After editing content:

1. Run `npm run build`
2. Run `npm run check`
3. Commit updated generated files

## GitHub Pages + Custom Domain Deploy

1. Build and validate locally:
   - `npm run build`
   - `npm run check`
2. Commit all changed output files.
3. Push to the branch configured for GitHub Pages.
4. In GitHub repository settings:
   - Pages source points to this branch/root flow.
   - Keep `CNAME` in repo with `rifkirosada.com`.
   - Keep `.nojekyll` in repo.

## Notes

- Internal links are validated across HTML output during build.
- Case studies are anonymized for client privacy with NDA-safe wording.
- `apps/offscanai` support/legal files are auto-maintained by the build script to avoid broken links.
