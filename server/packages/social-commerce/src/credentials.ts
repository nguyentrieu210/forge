import {
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
  type EncryptedCredentialEnvelope,
} from "../../integration-hub/src/credential-envelope.js";

export type EncryptedCredential = EncryptedCredentialEnvelope;

export async function encryptCredential(value: string, kekBase64: string, aad: string): Promise<string> {
  return encryptCredentialEnvelope(value, kekBase64, aad, "SOCIAL_CREDENTIAL_KEK");
}

export async function decryptCredential(envelopeJson: string, kekBase64: string, aad: string): Promise<string> {
  return decryptCredentialEnvelope(envelopeJson, kekBase64, aad, "SOCIAL_CREDENTIAL_KEK");
}
