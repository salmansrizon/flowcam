import { notFound } from "next/navigation";

/** Test harnesses under /dev exist only in development and test runs, never in production builds. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
