import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { DEMO_MODE } from "@/lib/demo";
import { FlaskIcon } from "@/components/Icons";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-xl border border-hairline bg-paper-raised p-8 text-center shadow-sm">
        <p className="font-serif text-2xl font-semibold text-ink">Chief of Staff</p>
        <p className="mt-2 text-sm text-ink-soft">
          Your AI chief of staff — it watches your work, remembers your commitments, and prepares you for what&apos;s coming.
        </p>

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/today" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-hairline-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-paper-raised"
          >
            Continue with Google
          </button>
        </form>

        <p className="mt-4 text-[11px] text-ink-faint">One Google consent connects sign-in, Gmail, Calendar, and Drive.</p>

        {DEMO_MODE && (
          <div className="mt-6 border-t border-hairline pt-4">
            <Link
              href="/today"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-accent/50 bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent transition hover:opacity-90"
            >
              <FlaskIcon className="h-4 w-4 shrink-0" aria-hidden />
              Explore demo (dev only)
            </Link>
            <p className="mt-2 text-[11px] text-ink-faint">
              Skips sign-in and shows the app with mock data. Only available in local development.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
