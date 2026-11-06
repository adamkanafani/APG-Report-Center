import { cookies } from "next/headers";
import { isUnlocked, pinConfigured, UNLOCK_COOKIE } from "@/atsReviewer/lib/pinLock";
import { PinGate } from "./PinGate";
import ReviewerApp from "./ReviewerApp";

/** The Reviewer opens only for a browser that has entered the reviewer PIN (see pinLock.ts). */
export default async function ReviewerPage() {
  const unlocked = isUnlocked((await cookies()).get(UNLOCK_COOKIE)?.value);
  return unlocked ? <ReviewerApp /> : <PinGate configured={pinConfigured()} />;
}
