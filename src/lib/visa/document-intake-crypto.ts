import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";
import type { VisaDocumentSensitiveData } from "./document-intake-schema";

const ENVELOPE_VERSION = 1;
const sensitiveSchema = z.object({
  nationalIdNumber: z.string().max(80),
  primaryPassportNumber: z.string().max(32),
  otherPassportNumbers: z.record(z.string(), z.string().max(32)),
});

function encryptionKey(): Buffer {
  const dedicated = process.env.VISA_DOCUMENT_ENCRYPTION_KEY?.trim();
  const rootSecret = dedicated || process.env.VISA_PAYMENT_LINK_SECRET?.trim();
  if (!rootSecret) {
    throw new Error("VISA_DOCUMENT_ENCRYPTION_KEY 설정이 필요합니다.");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(rootSecret, "utf8"),
      Buffer.from("deetz-visa-document-intake", "utf8"),
      Buffer.from("aes-256-gcm-v1", "utf8"),
      32,
    ),
  );
}

function aad(applicationId: string): Buffer {
  return Buffer.from(`deetz:visa-document-intake:v${ENVELOPE_VERSION}:${applicationId}`, "utf8");
}

export function encryptVisaDocumentSensitiveData(
  applicationId: string,
  value: VisaDocumentSensitiveData,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(aad(applicationId));
  const plaintext = Buffer.from(JSON.stringify(sensitiveSchema.parse(value)), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${ENVELOPE_VERSION}`,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptVisaDocumentSensitiveData(
  applicationId: string,
  envelope: string | null | undefined,
): VisaDocumentSensitiveData | null {
  if (!envelope) return null;
  const [version, ivRaw, tagRaw, ciphertextRaw] = envelope.split(".");
  if (version !== `v${ENVELOPE_VERSION}` || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("지원하지 않는 비자 서류 암호문 형식입니다.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAAD(aad(applicationId));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return sensitiveSchema.parse(JSON.parse(plaintext));
}

export function visaDocumentEncryptionReady(): boolean {
  return Boolean(
    process.env.VISA_DOCUMENT_ENCRYPTION_KEY?.trim() ||
      process.env.VISA_PAYMENT_LINK_SECRET?.trim(),
  );
}
