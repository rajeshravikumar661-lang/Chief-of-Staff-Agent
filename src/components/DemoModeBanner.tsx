import { FlaskIcon } from "@/components/Icons";

/**
 * Only ever rendered when DEMO_MODE is true, which (see src/lib/demo.ts) is
 * only possible under `next dev` — this can't ship in a production build.
 */
export function DemoModeBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-accent/40 bg-accent-soft px-4 py-1.5 text-xs font-medium text-accent">
      <FlaskIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Demo mode — viewing mock data, no sign-in required. Nothing here is saved or sent anywhere.
    </div>
  );
}
