"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  ingestEdiFile,
  DuplicateFileError,
  TooManyClaimsError,
  IngestValidationError
} from "@/lib/ingest";
import { recordAudit } from "@/lib/audit";
import { denyDemoWrite } from "@/lib/demo";

export interface UploadState {
  error?: string;
  success?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadEdi(
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in to upload." };
  // Uploads write persistent, attacker-supplied rows into the demo tenant and
  // are the one place an anonymous visitor could push data through the parser.
  const denied = denyDemoWrite(user);
  if (denied) return denied;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an EDI file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "File exceeds the 10 MB limit." };
  }

  const content = await file.text();

  try {
    const result = await ingestEdiFile({
      organizationId: user.organizationId,
      uploadedById: user.id,
      fileName: file.name,
      content
    });
    revalidatePath("/uploads");
    revalidatePath("/dashboard");
    revalidatePath("/claims");
    await recordAudit({
      organizationId: user.organizationId,
      userId: user.id,
      userEmail: user.email,
      action: "file.upload",
      targetType: "ediFile",
      targetId: result.ediFileId,
      detail: `${result.type} · ${result.claimCount} claims`
    });
    return {
      success: `Processed ${file.name}: ${result.claimCount} ${
        result.type === "X835" ? "remittance" : "claim"
      } records imported.`
    };
  } catch (err) {
    // Only surface messages we authored (safe, no PHI / internals). Anything
    // else is logged server-side and shown as a generic message so a raw DB or
    // parser exception can't leak file contents or schema details to the client.
    if (
      err instanceof DuplicateFileError ||
      err instanceof TooManyClaimsError ||
      err instanceof IngestValidationError
    ) {
      return { error: err.message };
    }
    console.error("uploadEdi failed:", err);
    return {
      error:
        "We couldn't process that file. Please confirm it's a valid X12 835/837 and try again."
    };
  }
}
