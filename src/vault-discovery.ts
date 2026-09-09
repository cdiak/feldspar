import { readdir, readFile, stat } from "fs/promises";
import { homedir, platform } from "os";
import { basename, join, normalize, resolve } from "path";

import type { DiscoveredVault, DiscoveryOptions, VaultSource } from "./types";

const DEFAULT_EXCLUDED_DIRECTORIES = [
  ".git",
  ".hg",
  ".obsidian",
  ".svn",
  "Library",
  "node_modules",
  ".Trash",
];

interface RegistryVault {
  path?: unknown;
}

interface ObsidianRegistry {
  vaults?: Record<string, RegistryVault>;
}

interface PendingDirectory {
  depth: number;
  path: string;
}

export function defaultRegistryPath(): string {
  const home = homedir();

  if (platform() === "darwin") {
    return join(home, "Library", "Application Support", "obsidian", "obsidian.json");
  }

  if (platform() === "win32") {
    return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "obsidian", "obsidian.json");
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "obsidian", "obsidian.json");
}

export function defaultExcludedDirectories(): string[] {
  return [...DEFAULT_EXCLUDED_DIRECTORIES];
}

export async function discoverVaults(options: DiscoveryOptions): Promise<DiscoveredVault[]> {
  const byPath = new Map<string, DiscoveredVault>();

  const addVault = (vaultPath: string, source: VaultSource): void => {
    const normalizedPath = normalize(resolve(vaultPath));
    const existing = byPath.get(normalizedPath);

    if (existing) {
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
      }
      return;
    }

    byPath.set(normalizedPath, {
      name: basename(normalizedPath),
      path: normalizedPath,
      sources: [source],
    });
  };

  const registryPaths = await readRegisteredVaultPaths(options.registryPath);
  for (const vaultPath of registryPaths) {
    if (await isVaultDirectory(vaultPath)) {
      addVault(vaultPath, "registry");
    }
  }

  if (options.activeVaultPath && await isVaultDirectory(options.activeVaultPath)) {
    addVault(options.activeVaultPath, "active");
  }

  const excludedNames = new Set(options.excludedDirectoryNames);
  for (const root of options.roots.filter((candidate) => candidate.trim())) {
    const vaultPaths = await scanForVaults(root, excludedNames, options.maxDepth);
    for (const vaultPath of vaultPaths) {
      addVault(vaultPath, "scan");
    }
  }

  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

async function readRegisteredVaultPaths(registryPath: string): Promise<string[]> {
  try {
    const content = await readFile(registryPath, "utf8");
    const registry = JSON.parse(content) as ObsidianRegistry;

    if (!registry.vaults || typeof registry.vaults !== "object") {
      return [];
    }

    return Object.values(registry.vaults)
      .map((vault) => vault.path)
      .filter((vaultPath): vaultPath is string => typeof vaultPath === "string");
  } catch {
    return [];
  }
}

async function scanForVaults(
  root: string,
  excludedNames: Set<string>,
  maxDepth: number,
): Promise<string[]> {
  const pending: PendingDirectory[] = [{ depth: 0, path: resolve(root) }];
  const vaultPaths: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    if (await isVaultDirectory(current.path)) {
      vaultPaths.push(current.path);
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    try {
      const entries = await readdir(current.path, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || excludedNames.has(entry.name)) {
          continue;
        }

        pending.push({
          depth: current.depth + 1,
          path: join(current.path, entry.name),
        });
      }
    } catch {
      continue;
    }
  }

  return vaultPaths;
}

async function isVaultDirectory(candidatePath: string): Promise<boolean> {
  try {
    return (await stat(join(candidatePath, ".obsidian"))).isDirectory();
  } catch {
    return false;
  }
}
