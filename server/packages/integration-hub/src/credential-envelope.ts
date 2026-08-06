export interface EncryptedCredentialEnvelope {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
}

/** Encrypt one secret payload with tenant/scope-bound AAD. */
export async function encryptCredentialEnvelope(
  value: string,
  kekBase64: string,
  aad: string,
  keyLabel = "credential KEK",
): Promise<string> {
  if (!value) throw new Error("Credential is empty");
  const keyBytes = decodeBase64(kekBase64);
  if (keyBytes.byteLength !== 32) throw new Error(`${keyLabel} must decode to 32 bytes`);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(value),
  );
  return JSON.stringify({
    version: 1,
    algorithm: "AES-GCM",
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
  } satisfies EncryptedCredentialEnvelope);
}

/** Decrypt one envelope only under the exact same tenant/scope AAD. */
export async function decryptCredentialEnvelope(
  envelopeJson: string,
  kekBase64: string,
  aad: string,
  keyLabel = "credential KEK",
): Promise<string> {
  let envelope: Partial<EncryptedCredentialEnvelope>;
  try { envelope = JSON.parse(envelopeJson) as Partial<EncryptedCredentialEnvelope>; }
  catch { throw new Error("Invalid credential envelope"); }
  if (envelope.version !== 1 || envelope.algorithm !== "AES-GCM" || !envelope.iv || !envelope.ciphertext) {
    throw new Error("Invalid credential envelope");
  }
  const keyBytes = decodeBase64(kekBase64);
  if (keyBytes.byteLength !== 32) throw new Error(`${keyLabel} must decode to 32 bytes`);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodeBase64(envelope.iv),
      additionalData: new TextEncoder().encode(aad),
    },
    key,
    decodeBase64(envelope.ciphertext),
  );
  return new TextDecoder().decode(clear);
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try { binary = atob(value); }
  catch { throw new Error("Credential KEK is not valid base64"); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
