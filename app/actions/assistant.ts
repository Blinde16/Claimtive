"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { answerAssistant, type ChatTurn } from "@/lib/ai/chat";
import { recordAudit } from "@/lib/audit";

export interface AssistantReply {
  answer: string;
}

export async function askAssistant(history: ChatTurn[]): Promise<AssistantReply> {
  const user = await getCurrentUser();
  if (!user) return { answer: "Please sign in to use the assistant." };

  // Sanitize the client-provided history.
  const safeHistory: ChatTurn[] = (Array.isArray(history) ? history : [])
    .filter(
      (t): t is ChatTurn =>
        !!t &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.content === "string" &&
        t.content.length <= 4000
    )
    .slice(-12);

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "assistant.query"
  });

  const answer = await answerAssistant(user.organizationId, safeHistory);
  return {
    answer:
      answer ??
      "The assistant is unavailable right now. You can still use the Dashboard and Claims pages — try again shortly."
  };
}
