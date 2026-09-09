import { homedir } from "os";
import { join, parse, relative, sep } from "path";

import type { DiscoveredVault } from "./types";

/**
 * A node in the display tree. A node can stand for several folders at once:
 * single-child folder chains collapse into one row, the way GitHub shows
 * `src / main / java`. `segments` holds each folder name in that chain.
 */
export interface VaultTreeNode {
  children: VaultTreeNode[];
  depth: number;
  path: string;
  segments: string[];
  vault?: DiscoveredVault;
  vaultCount: number;
}

interface MutableNode {
  children: Map<string, MutableNode>;
  name: string;
  path: string;
  vault?: DiscoveredVault;
}

interface PathStep {
  name: string;
  path: string;
}

export const HOME_LABEL = "~";

export function buildVaultTree(vaults: DiscoveredVault[], home: string = homedir()): VaultTreeNode[] {
  const roots = new Map<string, MutableNode>();

  for (const vault of vaults) {
    let level = roots;
    let node: MutableNode | undefined;

    for (const step of pathSteps(vault.path, home)) {
      node = level.get(step.name);
      if (!node) {
        node = { children: new Map(), name: step.name, path: step.path };
        level.set(step.name, node);
      }
      level = node.children;
    }

    if (node) {
      node.vault = vault;
    }
  }

  return finalizeChildren(roots, 0);
}

/** Keeps only the vaults whose name or path contains the query. */
export function filterVaultTree(nodes: VaultTreeNode[], query: string): VaultTreeNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return nodes;
  }

  const kept: VaultTreeNode[] = [];
  for (const node of nodes) {
    const children = filterVaultTree(node.children, needle);
    const selfMatches = node.vault ? matchesVault(node.vault, needle) : false;
    if (!selfMatches && children.length === 0) {
      continue;
    }
    kept.push({
      ...node,
      children,
      vaultCount: (selfMatches ? 1 : 0) + children.reduce((sum, child) => sum + child.vaultCount, 0),
    });
  }
  return kept;
}

export function collectFolderPaths(nodes: VaultTreeNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.children.length > 0) {
      into.push(node.path);
      collectFolderPaths(node.children, into);
    }
  }
  return into;
}

function matchesVault(vault: DiscoveredVault, needle: string): boolean {
  return vault.name.toLowerCase().includes(needle) || vault.path.toLowerCase().includes(needle);
}

function pathSteps(vaultPath: string, home: string): PathStep[] {
  const parsed = parse(vaultPath);
  const underHome = vaultPath === home || vaultPath.startsWith(home + sep);
  const base = underHome ? home : parsed.root;
  const steps: PathStep[] = [{ name: underHome ? HOME_LABEL : parsed.root, path: base }];

  let current = base;
  for (const part of relative(base, vaultPath).split(sep).filter(Boolean)) {
    current = join(current, part);
    steps.push({ name: part, path: current });
  }
  return steps;
}

function finalizeChildren(children: Map<string, MutableNode>, depth: number): VaultTreeNode[] {
  return [...children.values()]
    .map((child) => finalize(child, depth))
    .sort(compareNodes);
}

/** Collapses a chain of single-child folders into one node. */
function finalize(node: MutableNode, depth: number): VaultTreeNode {
  const segments = [node.name];
  let tail = node;

  while (!tail.vault && tail.children.size === 1) {
    const [only] = tail.children.values();
    segments.push(only.name);
    tail = only;
  }

  const children = finalizeChildren(tail.children, depth + 1);
  return {
    children,
    depth,
    path: tail.path,
    segments,
    vault: tail.vault,
    vaultCount: (tail.vault ? 1 : 0) + children.reduce((sum, child) => sum + child.vaultCount, 0),
  };
}

/** Folders first, then vaults, each group alphabetical. */
function compareNodes(left: VaultTreeNode, right: VaultTreeNode): number {
  const leftIsFolder = left.children.length > 0 ? 0 : 1;
  const rightIsFolder = right.children.length > 0 ? 0 : 1;
  if (leftIsFolder !== rightIsFolder) {
    return leftIsFolder - rightIsFolder;
  }
  return left.segments[0].localeCompare(right.segments[0], undefined, { numeric: true, sensitivity: "base" });
}
