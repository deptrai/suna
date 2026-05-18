import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from '../config';

const ENC_PREFIX = 'enc:v1';
const LEGACY_ENC_PREFIX = 'v1';
const SERVICE_KEY_ENC_FIELD = 'serviceKeyEnc';
const SERVICE_KEY_PLAIN_FIELD = 'serviceKey';
const SERVICE_KEY_ENC_KEY_ID_FIELD = 'serviceKeyEncKeyId';
const SERVICE_KEY_ENC_ALG_FIELD = 'serviceKeyEncAlg';

function getEncryptionKey(): Buffer {
  return createHash('sha256').update(config.SANDBOX_SERVICE_KEY_ENCRYPTION_SECRET || config.API_KEY_SECRET).digest();
}

function getEncryptionKeyId(): string {
  return config.SANDBOX_SERVICE_KEY_ENCRYPTION_KEY_ID || 'default';
}

function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENC_PREFIX,
    getEncryptionKeyId(),
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

function decryptString(payload: string): string {
  const parts = payload.split(':');
  const isCurrent = parts.length === 6 && `${parts[0]}:${parts[1]}` === ENC_PREFIX;
  const isLegacy = parts.length === 4 && parts[0] === LEGACY_ENC_PREFIX;
  if (!isCurrent && !isLegacy) return '';

  const iv = Buffer.from((isCurrent ? parts[3] : parts[1]) || '', 'base64url');
  const tag = Buffer.from((isCurrent ? parts[4] : parts[2]) || '', 'base64url');
  const encrypted = Buffer.from((isCurrent ? parts[5] : parts[3]) || '', 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function getSandboxServiceKeyFromConfig(configJson: Record<string, unknown> | null | undefined): string {
  if (!configJson || typeof configJson !== 'object') return '';
  const enc = configJson[SERVICE_KEY_ENC_FIELD];
  const plain = configJson[SERVICE_KEY_PLAIN_FIELD];
  if (typeof enc === 'string' && enc.length > 0) {
    try {
      const decrypted = decryptString(enc);
      if (decrypted) return decrypted;
      if (typeof plain === 'string' && plain.length > 0) {
        console.warn('[sandbox-secrets] serviceKeyEnc is not decryptable; falling back to plaintext serviceKey for migration');
        return plain;
      }
      return '';
    } catch (err) {
      if (typeof plain === 'string' && plain.length > 0) {
        console.warn('[sandbox-secrets] serviceKeyEnc decrypt failed; falling back to plaintext serviceKey for migration');
        return plain;
      }
      console.warn('[sandbox-secrets] serviceKeyEnc decrypt failed and no plaintext fallback exists:', err instanceof Error ? err.message : String(err));
      return '';
    }
  }
  return typeof plain === 'string' ? plain : '';
}

export function buildSandboxServiceKeyConfigPatch(serviceKey: string): Record<string, unknown> {
  return {
    [SERVICE_KEY_ENC_FIELD]: encryptString(serviceKey),
    [SERVICE_KEY_ENC_KEY_ID_FIELD]: getEncryptionKeyId(),
    [SERVICE_KEY_ENC_ALG_FIELD]: 'aes-256-gcm',
    serviceKeyEncryptedAt: new Date().toISOString(),
  };
}

export function setSandboxServiceKeyInConfig(
  configJson: Record<string, unknown> | null | undefined,
  serviceKey: string,
): Record<string, unknown> {
  const next = { ...((configJson as Record<string, unknown> | null) ?? {}) };
  Object.assign(next, buildSandboxServiceKeyConfigPatch(serviceKey));
  delete next[SERVICE_KEY_PLAIN_FIELD];
  return next;
}
