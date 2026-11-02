/** A post-sign-in destination: a same-origin path only. Anything else (other origins, `//host`, `/\host`) becomes `/`. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\u0000-\u001f]/.test(next)) return "/";
  return next;
}
