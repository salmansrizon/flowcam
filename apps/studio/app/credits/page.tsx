import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/studio/TopBar";
import { Panel } from "@/components/studio/Panel";
import { readCredits } from "@/modules/credits/read";

export const metadata: Metadata = { title: "Credits · Flowcam Studio" };

export default async function CreditsPage() {
  const credits = await readCredits().catch(() => null);
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar>
        <h1 className="text-sm font-medium">Credits</h1>
      </TopBar>
      <main className="mx-auto w-full max-w-2xl space-y-4 p-4">
        {!credits ? (
          <Panel className="p-6">
            <p className="font-medium">Sign in to see your Credits</p>
            <p className="mt-1 text-sm text-muted-foreground">Credits pay for AI features. Free local use never needs them.</p>
            <Link href="/" className="mt-3 inline-block text-sm underline">Back to the studio</Link>
          </Panel>
        ) : (
          <>
            <Panel className="p-6">
              <p className="text-sm text-muted-foreground">Available balance</p>
              <p className="text-4xl font-semibold tabular-nums" data-testid="balance">{credits.balance}</p>
              <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                {Object.entries(credits.byBucket).map(([bucket, n]) => (
                  <li key={bucket} className="rounded-md border p-2">
                    <span className="block capitalize text-muted-foreground">{bucket}</span>
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="p-2">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="p-2">When</th><th>Kind</th><th>Bucket</th><th className="p-2 text-right">Credits</th></tr></thead>
                <tbody>
                  {credits.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">{new Date(l.created_at).toLocaleString()}</td>
                      <td>{l.kind}</td>
                      <td>{l.bucket}</td>
                      <td className="p-2 text-right tabular-nums">{l.amount}</td>
                    </tr>
                  ))}
                  {credits.lines.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No Credit activity yet.</td></tr>}
                </tbody>
              </table>
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}
