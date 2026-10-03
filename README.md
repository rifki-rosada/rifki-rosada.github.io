# Rifki Rosada Portfolio

Static portfolio for GitHub Pages + custom domain deployment (`rifkirosada.com`).

The client path is homepage outcome proof → case studies → services → contact. The recruiter path is `/experience/` with a direct resume download. The estimator is an optional planning tool for automation and internal systems.

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

### Lead submission

The contact and estimator forms submit through FormSubmit's AJAX endpoint to `rifki@rifkirosada.com`. Visitors remain on the site. A submission is shown as received only when the service returns a successful response. Failed requests reveal an email fallback that contains the same brief.

The first production submission triggers an activation email to the contact inbox. The mailbox owner must confirm it before delivery is live, then verify a second test lead arrives with the full brief. FormSubmit says it holds pending submissions for up to 30 days. Check the inbox and spam folder. Its documented free tier supports unlimited forms and submissions, but it is a third-party service and retains submissions for 30 days.

Spam controls are a hidden honeypot, FormSubmit's filtering, and a short repeat-submit cooldown for estimates. The forms send no private API key. The estimator notification includes the complete structured result and all selected answers as JSON; the contact notification includes every visible field.

The estimate selects a planning package from scope complexity. Budget readiness can route a low-budget lead to a smaller audit, but a larger available budget does not force an advanced package. Starting service prices and estimator bands are both indicative; final quotes follow scope review.

Do not commit private credentials or a local `.env`. The older Apps Script guide in `docs/estimate-apps-script.md` is retained for reference and is not the active submission path.

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
- Generated HTML adds content-hash query strings to CSS and JavaScript URLs so GitHub Pages and returning browsers load the matching assets after a deployment.
- Case studies are anonymized for client privacy with NDA-safe wording.
- Case cover art is illustrative. The linked Loom walkthrough is actual project footage; do not label cover art as a product screenshot or add client screens without permission.
- `apps/offscanai` support/legal files are auto-maintained by the build script to avoid broken links.
