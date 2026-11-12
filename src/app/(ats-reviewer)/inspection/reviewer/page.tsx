import { cookies } from "next/headers";
import { reviewersConfigured, SESSION_COOKIE, signedInUser } from "@/atsReviewer/lib/reviewerAuth";
import { PinGate } from "./PinGate";
import ReviewerApp from "./ReviewerApp";
import { SignedInBadge } from "./SignedInBadge";

/** The Reviewer opens only for a signed-in reviewer (see reviewerAuth.ts). */
export default async function ReviewerPage() {
  const user = signedInUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return <PinGate configured={reviewersConfigured()} />;
  return (
    <>
      <ReviewerApp />
      <SignedInBadge user={user} />
    </>
  );
}
