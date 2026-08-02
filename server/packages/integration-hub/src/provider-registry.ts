import type { ConnectorProviderAdapter } from "./adapter.js";
import { assertProviderAdapterConformance } from "./adapter.js";
import type { ConnectorManifest } from "./catalog.js";
import { compareConnectorVersions, validateConnectorManifest } from "./catalog.js";

export class ConnectorProviderRegistry {
  private readonly adapters = new Map<string, ConnectorProviderAdapter>();

  register(adapter: ConnectorProviderAdapter): this {
    const conformance = assertProviderAdapterConformance(adapter);
    const key = registryKey(conformance.connector_key, conformance.version);
    if (this.adapters.has(key)) throw new Error(`Connector adapter already registered: ${key}`);
    this.adapters.set(key, adapter);
    return this;
  }

  get(connectorKey: string, version: string): ConnectorProviderAdapter | null {
    return this.adapters.get(registryKey(connectorKey, version)) ?? null;
  }

  require(connectorKey: string, version: string): ConnectorProviderAdapter {
    const adapter = this.get(connectorKey, version);
    if (!adapter) throw new Error(`Connector adapter is not registered: ${connectorKey}@${version}`);
    return adapter;
  }

  list(): ConnectorManifest[] {
    return [...this.adapters.values()]
      .map((adapter) => validateConnectorManifest(adapter.manifest))
      .sort((left, right) => `${left.connector_key}@${left.version}`.localeCompare(`${right.connector_key}@${right.version}`));
  }

  resolveCompatible(current: ConnectorManifest, candidateVersion: string): ConnectorProviderAdapter {
    validateConnectorManifest(current);
    const candidate = this.require(current.connector_key, candidateVersion);
    const compatibility = compareConnectorVersions(current, candidate.manifest);
    if (!compatibility.compatible) {
      throw new Error(`Connector version is not compatible: ${compatibility.reason}`);
    }
    return candidate;
  }
}

function registryKey(connectorKey: string, version: string): string {
  if (!connectorKey || connectorKey.length > 80 || /[\r\n\0@]/.test(connectorKey)) throw new Error("Invalid connector key");
  if (!version || version.length > 80 || /[\r\n\0@]/.test(version)) throw new Error("Invalid connector version");
  return `${connectorKey}@${version}`;
}
