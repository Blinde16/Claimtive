import { getCurrentUser } from "@/lib/auth/current-user";
import { AssistantChat } from "@/components/AssistantChat";

export const metadata = { title: "Assistant" };

export default async function AssistantPage() {
  // Auth is enforced by middleware; this also primes the per-request user cache.
  await getCurrentUser();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Assistant</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ask questions about your denials, underpayments, payers, and uploaded
          files in plain English.
        </p>
      </div>
      <AssistantChat />
    </div>
  );
}
