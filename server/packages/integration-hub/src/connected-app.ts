/** Trusted-runtime OAuth lifecycle. Never return tokens through public HTTP handlers. */
export interface ConnectedAppIdentity { tenantId: string; userId: string; appId: string }
export interface ConnectedAppConfig {
  appId: string; authorizationUrl: string; tokenUrl: string; redirectUri: string;
  allowedHosts: readonly string[]; scopes: readonly string[];
}
export interface OAuthCredentials { clientId: string; clientSecret: string }
export interface OAuthToken { accessToken: string; refreshToken?: string; expiresAt: number }
export interface OAuthState extends ConnectedAppIdentity {
  stateHash: string; verifierCiphertext: string; expiresAt: number; connectionVersion: number;
}
export interface OAuthConnection extends ConnectedAppIdentity {
  tokenCiphertext: string | null; expiresAt: number; version: number;
}
export interface ConnectedAppStore {
  ensureConnection(identity: ConnectedAppIdentity): Promise<number>;
  putState(state: OAuthState): Promise<void>;
  consumeState(identity: ConnectedAppIdentity, stateHash: string, now: number): Promise<OAuthState | null>;
  getConnection(identity: ConnectedAppIdentity): Promise<OAuthConnection | null>;
  /** Compare-and-set; expectedVersion null requires absence. */
  saveConnection(connection: OAuthConnection, expectedVersion: number | null): Promise<boolean>;
  acquireRefresh(identity: ConnectedAppIdentity, version: number, lease: string, now: number): Promise<boolean>;
  releaseRefresh(identity: ConnectedAppIdentity, lease: string): Promise<void>;
  disconnect(identity: ConnectedAppIdentity): Promise<void>;
}
export interface ConnectedAppRuntime {
  store: ConnectedAppStore;
  /** Credentials and key must come from worker secret bindings / trusted vault. */
  credentials(config: ConnectedAppConfig): Promise<OAuthCredentials>;
  encryptionKey: CryptoKey;
  fetch: typeof fetch;
  now?: () => number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function random(): string { return base64(crypto.getRandomValues(new Uint8Array(32))); }
function base64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
function unbase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encrypted token');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
async function digest(value: string): Promise<string> { return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
function identityKey(identity: ConnectedAppIdentity, purpose: string): string {
  for (const value of [identity.tenantId, identity.userId, identity.appId]) {
    if (!value || value.length > 160 || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid connected app identity');
  }
  return JSON.stringify([identity.tenantId, identity.userId, identity.appId, purpose]);
}
async function seal(key: CryptoKey, value: unknown, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, encoder.encode(JSON.stringify(value)));
  return `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
async function open<T>(key: CryptoKey, value: string, aad: string): Promise<T> {
  const parts = value.split('.');
  if (parts.length !== 2) throw new Error('Invalid encrypted token');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(parts[0]!), additionalData: encoder.encode(aad) }, key, unbase64(parts[1]!));
  return JSON.parse(decoder.decode(plaintext)) as T;
}
export async function importConnectedAppKey(bytes: Uint8Array): Promise<CryptoKey> {
  if (bytes.length !== 32) throw new Error('Connected app key must contain 32 bytes');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function validateConfig(config: ConnectedAppConfig, identity: ConnectedAppIdentity): void {
  identityKey(identity, 'validate');
  if (config.appId !== identity.appId) throw new Error('Connected app mismatch');
  for (const target of [config.authorizationUrl, config.tokenUrl]) {
    const url = new URL(target);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !config.allowedHosts.includes(url.hostname)
      || !/^[a-z0-9.-]+$/i.test(url.hostname) || /^(localhost|.*\.localhost|.*\.local)$/.test(url.hostname)
      || /^[\d.]+$/.test(url.hostname)) throw new Error('Invalid OAuth provider endpoint');
  }
  const redirect = new URL(config.redirectUri);
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash) throw new Error('Invalid OAuth redirect URI');
  if (config.scopes.length > 64 || config.scopes.some(scope => !scope || /\s/.test(scope) || scope.length > 160)) throw new Error('Invalid OAuth scopes');
}

export class ConnectedAppService {
  private readonly runtime: ConnectedAppRuntime;
  constructor(runtime: ConnectedAppRuntime) { this.runtime = runtime; }
  private now(): number { return this.runtime.now?.() ?? Date.now(); }
  async start(identity: ConnectedAppIdentity, config: ConnectedAppConfig): Promise<{ authorizationUrl: string }> {
    validateConfig(config, identity);
    const credentials = await this.runtime.credentials(config);
    if (!credentials.clientId || !credentials.clientSecret) throw new Error('Connected app credentials unavailable');
    const state = random(); const verifier = random();
    const connectionVersion = await this.runtime.store.ensureConnection(identity);
    await this.runtime.store.putState({ ...identity, connectionVersion, stateHash: await digest(state),
      verifierCiphertext: await seal(this.runtime.encryptionKey, { verifier, configHash: await digest(JSON.stringify(config)) }, identityKey(identity, 'state')),
      expiresAt: this.now() + 600_000 });
    const url = new URL(config.authorizationUrl);
    url.searchParams.set('response_type', 'code'); url.searchParams.set('client_id', credentials.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri); url.searchParams.set('scope', config.scopes.join(' '));
    url.searchParams.set('state', state); url.searchParams.set('code_challenge', await digest(verifier)); url.searchParams.set('code_challenge_method', 'S256');
    return { authorizationUrl: url.toString() };
  }
  async callback(identity: ConnectedAppIdentity, config: ConnectedAppConfig, state: string, code: string): Promise<{ connected: true }> {
    validateConfig(config, identity);
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) throw new Error('Invalid OAuth callback');
    const pending = await this.runtime.store.consumeState(identity, await digest(state), this.now());
    if (!pending) throw new Error('OAuth state expired, consumed or identity mismatch');
    const payload = await open<{ verifier: string; configHash: string }>(this.runtime.encryptionKey, pending.verifierCiphertext, identityKey(identity, 'state'));
    if (payload.configHash !== await digest(JSON.stringify(config))) throw new Error('OAuth configuration changed');
    const token = await this.exchange(config, { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: payload.verifier });
    const saved = await this.runtime.store.saveConnection({ ...identity, tokenCiphertext: await seal(this.runtime.encryptionKey, { token, configHash: payload.configHash }, identityKey(identity, 'token')),
      expiresAt: token.expiresAt, version: pending.connectionVersion + 1 }, pending.connectionVersion);
    if (!saved) throw new Error('OAuth connection changed; reconnect required');
    return { connected: true };
  }
  /** Trusted outbound callers only; never expose this return value to a browser. */
  async getAccessToken(identity: ConnectedAppIdentity, config: ConnectedAppConfig): Promise<string> {
    validateConfig(config, identity);
    const current = await this.runtime.store.getConnection(identity);
    if (!current?.tokenCiphertext) throw new Error('Connected app is not connected');
    const cached = await open<{ token: OAuthToken; configHash: string }>(this.runtime.encryptionKey, current.tokenCiphertext, identityKey(identity, 'token'));
    if (cached.configHash !== await digest(JSON.stringify(config))) throw new Error('OAuth configuration changed; reconnect required');
    const token = cached.token;
    if (current.expiresAt > this.now() + 30_000) return token.accessToken;
    if (!token.refreshToken) throw new Error('Connected app requires reauthorization');
    const lease = random();
    if (!await this.runtime.store.acquireRefresh(identity, current.version, lease, this.now())) throw new Error('Connected app refresh in progress');
    try {
      const refreshed = await this.exchange(config, { grant_type: 'refresh_token', refresh_token: token.refreshToken });
      refreshed.refreshToken ??= token.refreshToken;
      if (!await this.runtime.store.saveConnection({ ...identity, tokenCiphertext: await seal(this.runtime.encryptionKey, { token: refreshed, configHash: cached.configHash }, identityKey(identity, 'token')),
        expiresAt: refreshed.expiresAt, version: current.version + 1 }, current.version)) throw new Error('OAuth connection changed during refresh');
      return refreshed.accessToken;
    } finally { await this.runtime.store.releaseRefresh(identity, lease); }
  }
  async disconnect(identity: ConnectedAppIdentity): Promise<void> { identityKey(identity, 'disconnect'); await this.runtime.store.disconnect(identity); }
  private async exchange(config: ConnectedAppConfig, input: Record<string, string>): Promise<OAuthToken> {
    const credentials = await this.runtime.credentials(config);
    if (!credentials.clientId || !credentials.clientSecret) throw new Error('Connected app credentials unavailable');
    const body = new URLSearchParams({ ...input, client_id: credentials.clientId, client_secret: credentials.clientSecret });
    let response: Response;
    try { response = await this.runtime.fetch(config.tokenUrl, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' } }); }
    catch { throw new Error('OAuth token exchange failed'); }
    // Provider errors may contain credentials: never forward their body or status text.
    if (!response.ok) throw new Error('OAuth token exchange failed');
    let raw: unknown;
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing OAuth response');
      let bytes = 0; let text = '';
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 131_072) { await reader.cancel(); throw new Error('OAuth response exceeds bounds'); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      raw = JSON.parse(text + decoder.decode());
    } catch { throw new Error('Invalid OAuth token response'); }
    if (!raw || typeof raw !== 'object') throw new Error('Invalid OAuth token response');
    const value = raw as Record<string, unknown>;
    if (typeof value.access_token !== 'string' || !value.access_token || value.access_token.length > 16_384 || /[\u0000-\u0020\u007f]/.test(value.access_token)
      || typeof value.token_type !== 'string' || value.token_type.toLowerCase() !== 'bearer'
      || typeof value.expires_in !== 'number' || !Number.isSafeInteger(value.expires_in) || value.expires_in < 1 || value.expires_in > 31_536_000
      || (value.refresh_token !== undefined && (typeof value.refresh_token !== 'string' || !value.refresh_token || value.refresh_token.length > 16_384 || /[\u0000-\u001f\u007f]/.test(value.refresh_token)))) throw new Error('Invalid OAuth token response');
    return { accessToken: value.access_token, ...(typeof value.refresh_token === 'string' ? { refreshToken: value.refresh_token } : {}), expiresAt: this.now() + value.expires_in * 1000 };
  }
}
