import Head from "next/head";

export default function FAQ() {
  return (
    <>
      <Head>
        <title>FAQ – OffScan AI</title>
        <meta
          name="description"
          content="Frequently asked questions about OffScan AI. Learn how offline OCR works, privacy details, supported languages, and premium features."
        />
        <meta
          property="og:title"
          content="OffScan AI – Frequently Asked Questions"
        />
        <meta
          property="og:description"
          content="Answers to common questions about OffScan AI including offline OCR, privacy, supported languages, and troubleshooting."
        />
        <meta
          property="og:url"
          content="https://rifkirosada.com/apps/offscanai/faq"
        />
      </Head>

      <main className="min-h-screen bg-[#050814] text-white px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Frequently Asked Questions</h1>

          <div className="space-y-10">

            <section>
              <h2 className="text-2xl font-semibold mb-3">
                Does OffScan AI work offline?
              </h2>
              <p className="text-gray-300">
                Yes. All OCR processing runs completely offline on your device.
                No images or text ever leave your phone.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">
                Does the app collect any data?
              </h2>
              <p className="text-gray-300">
                No. OffScan AI collects <strong>zero personal data</strong>.
                Everything is processed and stored locally.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">
                How accurate is the OCR?
              </h2>
              <p className="text-gray-300">
                Very accurate on clear images. If text is blurry or low-light,
                try focusing the camera or increasing brightness.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">
                Which languages are supported?
              </h2>
              <p className="text-gray-300">
                English is included by default. Additional OCR languages can be
                downloaded from inside the app when needed.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">
                I purchased premium but it didn’t unlock.
              </h2>
              <p className="text-gray-300">
                Restart the app and check your internet connection. If it still
                doesn’t unlock, contact support:
                <br />
                <a
                  href="mailto:artunare@gmail.com"
                  className="text-blue-400 hover:underline"
                  >artunare@gmail.com
                  </a>
              </p>
            </section>

          </div>

          <footer className="mt-16 text-gray-500 text-sm text-center">
            © {new Date().getFullYear()} OffScan AI – FAQ
          </footer>
        </div>
      </main>
    </>
  );
}
