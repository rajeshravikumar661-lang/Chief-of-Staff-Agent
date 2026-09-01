export const metadata = { title: "Privacy Policy · Chief of Staff Agent" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-3xl font-semibold text-ink">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-faint">Last updated: September 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-soft">
        <section>
          <h2 className="mb-2 text-base font-medium text-ink">What this app does</h2>
          <p>
            Chief of Staff Agent connects to your Google account (Gmail, Calendar, Drive) to help you
            track commitments, prepare for meetings, and manage your inbox. It only acts on data you
            explicitly connect, and only takes consequential actions (like sending an email) after you
            approve them.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium text-ink">Data we access</h2>
          <p>
            With your consent via Google Sign-In, we access: your Gmail messages (read and draft only —
            we never send email without your explicit approval of that specific draft), your Calendar
            events, and your Drive files (read-only), for the purpose of surfacing what needs your
            attention and preparing briefings.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium text-ink">How we store and use it</h2>
          <p>
            Data is stored in a private database associated with your account only and is never shared
            with other users. OAuth tokens are encrypted at rest. Content from your connected accounts
            may be sent to a large-language-model provider (e.g. Google Gemini, Anthropic, or OpenAI,
            depending on configuration) solely to generate summaries, briefings, and draft replies on
            your behalf — it is not used to train third-party models and is not sold or shared for
            advertising.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium text-ink">Your control</h2>
          <p>
            You can disconnect Google access at any time from the Connections page, which revokes and
            deletes stored tokens. Any action with real-world effect (like sending an email) requires
            your explicit approval before it happens — nothing is sent or changed silently.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium text-ink">Contact</h2>
          <p>Questions about this policy can be sent to the app&apos;s support contact listed in Google&apos;s consent screen for this application.</p>
        </section>
      </div>
    </main>
  );
}
