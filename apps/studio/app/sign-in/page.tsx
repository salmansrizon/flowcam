import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/studio/TopBar";
import { SignInForm } from "@/modules/account/SignInForm";

export const metadata: Metadata = { title: "Sign in · Flowcam Studio" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="grid flex-1 place-items-center p-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Sign in to Flowcam</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            We email you a one-time code. No password. Flowcam works without an account too:{" "}
            <Link href="/" className="underline underline-offset-4">
              back to the studio
            </Link>
            .
          </p>
          <SignInForm next={Array.isArray(next) ? next[0] : next} />
        </div>
      </main>
    </div>
  );
}
