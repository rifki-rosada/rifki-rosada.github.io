import Head from "next/head";

export default function Premium() {
  return (
    <>
      <Head>
        <title>Premium Features – OffScan AI</title>
        <meta
          name="description"
          content="Unlock premium features in OffScan AI including unlimited scans, export options, batch scanning, and more."
        />
      </Head>

      <main className="min-h-screen bg-[#050814] text-white px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold">OffScan AI Premium</h1>
          <p className="mt-3 text-gray-300 text-lg">
            Upgrade once. Unlock more power forever.
          </p>

          {/* Features */}
          <section className="mt-12 space-y-6">
            <h2 className="text-2xl font-semibold">What's included</h2>

            <ul className="space-y-4 text-gray-300">
              <li>✔ Unlimited OCR scans</li>
              <li>✔ Faster and more accurate AI processing</li>
              <li>✔ Advanced text export (PDF, Markdown, TXT)</li>
              <li>✔ Premium priority support</li>
              <li>✔ Future premium features included</li>
            </ul>
          </section>

          {/* How-to */}
          <section className="mt-12">
            <h2 className="text-2xl font-semibold">How to upgrade</h2>
            <p className="text-gray-300 mt-3">
              Inside the app, tap:
              <br />
              <strong>Menu → Upgrade to Premium</strong>
            </p>
          </section>

          {/* Refund link */}
          <section className="mt-12">
            <h2 className="text-2xl font-semibold">Refunds</h2>
            <p className="text-gray-300">
              Refunds are handled according to Google Play policy.
              <br />
              More info:
              <a
                href="/apps/offscanai/refund.html"
                className="text-blue-400 hover:underline ml-1"
                >Refund Policy
                </a>
            </p>
          </section>

          <footer className="mt-16 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} OffScan AI – Premium
          </footer>
        </div>
      </main>
    </>
  );
}
