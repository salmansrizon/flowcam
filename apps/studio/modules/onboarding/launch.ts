import { originFromEnv, proOpen } from "@flowcam/domain";

/** Whether Pro (accounts, Trial, billing, Share, AI) is open yet: NEXT_PUBLIC_PRO_LAUNCH_AT, failing closed in production. */
export const isProOpen = (now = new Date()) => proOpen(process.env.NEXT_PUBLIC_PRO_LAUNCH_AT, now, process.env.NODE_ENV === "production");

/** The marketing site's Pro waitlist (NEXT_PUBLIC_WEB_URL is the site's origin). */
export const WAITLIST_URL = `${originFromEnv("NEXT_PUBLIC_WEB_URL", process.env.NEXT_PUBLIC_WEB_URL, "http://localhost:3001", process.env.NODE_ENV === "production")}/waitlist`;
