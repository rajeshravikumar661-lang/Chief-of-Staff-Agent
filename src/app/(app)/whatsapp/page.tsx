import { WhatsAppConnect } from "@/components/WhatsAppConnect";

export const metadata = { title: "WhatsApp · Kora" };

export default function WhatsAppPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">WhatsApp</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Link your number once and get the daily brief pushed to you — no need to open the dashboard.
        </p>
      </div>
      <WhatsAppConnect />
    </div>
  );
}
