export interface EncryptedCredential {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
}

export async function encryptCredential(value: string, kekBase64: string, aad: string): Promise<string> {
  if (!value) throw new Error("Credential is empty");
  const keyBytes = decodeBase64(kekBase64);
  if (keyBytes.byteLength !== 32) throw new Error("SOCIAL_CREDENTIAL_KEK must decode to 32 bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, key, new TextEncoder().encode(value),
  );
  return JSON.stringify({ version: 1, algorithm: "AES-GCM", iv: encodeBase64(iv), ciphertext: encodeBase64(new Uint8Array(encrypted)) } satisfies EncryptedCredential);
}

export async function decryptCredential(envelopeJson: string, kekBase64: string, aad: string): Promise<string> {
  const envelope = JSON.parse(envelopeJson) as Partial<EncryptedCredential>;
  if (envelope.version !== 1 || envelope.algorithm !== "AES-GCM" || !envelope.iv || !envelope.ciphertext) throw new Error("Invalid credential envelope");
  const keyBytes = decodeBase64(kekBase64);
  if (keyBytes.byteLength !== 32) throw new Error("SOCIAL_CREDENTIAL_KEK must decode to 32 bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64(envelope.iv), additionalData: new TextEncoder().encode(aad) }, key, decodeBase64(envelope.ciphertext));
  return new TextDecoder().decode(clear);
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
