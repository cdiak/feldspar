export type VaultSource = "active" | "registry" | "scan";

export interface DiscoveredVault {
  name: string;
  path: string;
  sources: VaultSource[];
}

export interface DiscoveryOptions {
  activeVaultPath?: string;
  excludedDirectoryNames: string[];
  maxDepth: number;
  registryPath: string;
  roots: string[];
}

export interface FeldsparSettings {
  excludedDirectoryNames: string[];
  maxDepth: number;
  openOnStartup: boolean;
  roots: string[];
}
