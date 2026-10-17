import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <div className="sky-wash min-h-screen">
      <Nav />
      <main className="page-gutter">
        <div className="container-page py-24 text-center">
          <h1 className="text-3xl font-bold text-ink md:text-5xl">We can&apos;t find that page</h1>
          <p className="mt-4 text-lg text-ink-soft">The link may be old or mistyped. Start from the home page or browse the features.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn-green">Go home</Link>
            <Link href="/#all-features" className="btn-ghost">See features</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
