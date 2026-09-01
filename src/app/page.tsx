/**
 * Placeholder root page. Person B owns the real dashboard / app shell
 * (see PERSON_B_FRONTEND_PRODUCT.md). This just proves the app boots.
 */
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 40 }}>
      <h1>Chief of Staff Agent — backend online</h1>
      <p>API routes live under <code>/api</code>. Frontend is Person B&apos;s workstream.</p>
    </main>
  );
}
