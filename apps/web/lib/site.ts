import { originFromEnv, parseLaunchAt } from "@flowcam/domain";

/** The Studio's origin: "Try Flowcam free" goes here (app.getflowcam.com in production). */
export const STUDIO_URL = originFromEnv("NEXT_PUBLIC_STUDIO_URL", process.env.NEXT_PUBLIC_STUDIO_URL, "http://localhost:3000", process.env.NODE_ENV === "production");

/** The Pro launch moment for the /waitlist countdown; null shows "Coming soon". */
export const PRO_LAUNCH_AT = parseLaunchAt(process.env.NEXT_PUBLIC_PRO_LAUNCH_AT);

/** Where deletion requests go until a business address exists (shown on /privacy). */
export const CONTACT_EMAIL = "salmansrizon2016@gmail.com";
