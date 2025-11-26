import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OffScan AI – Offline OCR Scanner for Android",
  description:
    "OffScan AI is a fast, private, offline OCR scanner for Android. Convert photos and documents to text without internet or data collection.",
  alternates: {
    canonical: "https://rifkirosada.com/apps/offscanai",
  },
  openGraph: {
    title: "OffScan AI – Offline OCR Scanner for Android",
    description:
      "Secure, offline OCR scanning. Convert images and documents to editable text without uploading anything to the cloud.",
    url: "https://rifkirosada.com/apps/offscanai",
    siteName: "Rifki Rosada Apps",
    type: "website",
    images: [
      {
        url: "https://rifkirosada.com/apps/offscanai/preview.png",
        width: 1200,
        height: 630,
        alt: "OffScan AI app preview",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function OffScanLanding() {
  return (
    <>
      {/* JSON-LD FAQ Schema for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "Does OffScan AI work offline?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text":
                    "Yes, OffScan AI works fully offline. All OCR processing happens locally on your device."
                }
              },
              {
                "@type": "Question",
                "name": "Does the app collect personal data?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text":
                    "No. OffScan AI collects zero personal data. Nothing is uploaded or tracked."
                }
              },
              {
                "@type": "Question",
                "name": "Which languages are supported?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text":
                    "English is built-in. Additional languages can be downloaded as offline packs."
                }
              }
            ]
          }),
        }}
      />

      {/* --- MAIN CONTENT --- */}
      <main className="min-h-screen bg-[#050814] text-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-16 lg:flex-row lg:items-center">
          
          {/* Left: hero content */}
          <div className="flex-1">
            <div className="text-center lg:text-left">
              <Image
                src="/apps/offscanai/icon.png"
                alt="OffScan AI app icon"
                width={120}
                height={120}
                className="mx-auto mb-4 lg:mx-0"
                priority
              />
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                OffScan AI
              </h1>
              <p className="mt-3 text-lg text-gray-300 sm:text-xl">
                Fast, secure, offline OCR scanning powered by on-device AI. Turn
                photos and documents into editable text without leaving your
                phone.
              </p>

              <a
                href="https://play.google.com/store/apps/details?id=com.rifki.offscanai"
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold shadow-lg transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]"
                aria-label="Download OffScan AI on Google Play"
              >
                Download on Google Play
              </a>

              <p className="mt-4 text-sm text-gray-400">
                No account, no cloud uploads, no tracking – everything stays on
                your device.
              </p>
            </div>

            {/* Feature list */}
            <section
              id="features"
              className="mt-12 space-y-6 rounded-2xl bg-[#0b101f] p-6 shadow-xl sm:p-8"
            >
              <h2 className="text-2xl font-semibold">Why choose OffScan AI?</h2>
              <p className="text-gray-300">
                OffScan AI is built for privacy-first document scanning. Whether
                you scan homework, receipts, or printed essays, your content never
                leaves your phone.
              </p>
              <ul className="grid gap-4 text-gray-200 sm:grid-cols-2">
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-blue-400" />
                  <p>
                    <strong>100% offline OCR</strong>
                    <br />
                    All text recognition runs locally on your device.
                  </p>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-blue-400" />
                  <p>
                    <strong>Private by design</strong>
                    <br />
                    No image uploads, accounts, or tracking SDKs.
                  </p>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-blue-400" />
                  <p>
                    <strong>Multi-language support</strong>
                    <br />
                    Download extra language packs when you need them.
                  </p>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-blue-400" />
                  <p>
                    <strong>Flexible export</strong>
                    <br />
                    Copy to clipboard or export to text and PDF.
                  </p>
                </li>
              </ul>
            </section>

            {/* Helpful links */}
            <section id="resources" className="mt-10">
              <h2 className="text-xl font-semibold">Helpful resources</h2>
              <ul className="mt-4 space-y-2 text-blue-400">
                <li>
                  <a
                    href="/apps/offscanai/privacy.html"
                    className="hover:underline"
                  >
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a
                    href="/apps/offscanai/terms.html"
                    className="hover:underline"
                  >
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a
                    href="/apps/offscanai/refund.html"
                    className="hover:underline"
                  >
                    Refund Policy
                  </a>
                </li>
                <li>
                  <a
                    href="/apps/offscanai/support.html"
                    className="hover:underline"
                  >
                    Support
                  </a>
                </li>
              </ul>
            </section>
          </div>

          {/* Right: preview image */}
          <section className="flex-1">
            <h2 className="sr-only">OffScan AI app preview</h2>
            <div className="rounded-3xl border border-gray-800 bg-[#050814] p-3 shadow-2xl">
              <Image
                src="/apps/offscanai/preview.png"
                alt="Screenshot preview of the OffScan AI app interface"
                width={900}
                height={500}
                className="h-auto w-full rounded-2xl object-cover"
              />
            </div>
          </section>
        </div>

        <footer className="mt-16 border-t border-gray-800 pt-6 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} OffScan AI · Built by Rifki Rosada
        </footer>
      </main>
    </>
  );
}
