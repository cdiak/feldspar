import { ItemView, Notice, Platform, WorkspaceLeaf, setIcon } from "obsidian";

import type FeldsparPlugin from "../main";
import type { DiscoveredVault, VaultSource } from "./types";
import { buildVaultTree, collectFolderPaths, filterVaultTree, type VaultTreeNode } from "./vault-tree";

export const FELDSPAR_VIEW_TYPE = "feldspar";

const SOURCE_LABELS: Record<VaultSource, string> = {
  active: "current",
  registry: "registered",
  scan: "scanned",
};

export class FeldsparView extends ItemView {
  private readonly collapsed = new Set<string>();
  private filterQuery = "";
  private isRefreshing = false;
  private treeEl?: HTMLElement;
  private tree: VaultTreeNode[] = [];
  private vaults: DiscoveredVault[] = [];

  constructor(leaf: WorkspaceLeaf, private readonly plugin: FeldsparPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return FELDSPAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Feldspar";
  }

  getIcon(): string {
    return "map";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    this.renderLoading();

    try {
      this.vaults = await this.plugin.getVaults();
      this.tree = buildVaultTree(this.vaults);
      this.render();
    } catch (error) {
      this.renderError(error);
    } finally {
      this.isRefreshing = false;
    }
  }

  // ---------------------------------------------------------------- frames

  private resetFrame(): HTMLElement {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("feldspar-view");
    this.treeEl = undefined;
    return contentEl;
  }

  private renderLoading(): void {
    const frame = this.resetFrame();
    this.renderHeader(frame, false);
    const state = frame.createDiv({ cls: "feldspar-state" });
    setIcon(state.createSpan({ cls: "feldspar-state-icon is-spinning" }), "loader");
    state.createSpan({ text: "Discovering local vaults…" });
  }

  private renderError(error: unknown): void {
    const frame = this.resetFrame();
    this.renderHeader(frame, false);
    const state = frame.createDiv({ cls: "feldspar-state is-error" });
    setIcon(state.createSpan({ cls: "feldspar-state-icon" }), "alert-triangle");
    state.createSpan({ text: error instanceof Error ? error.message : "Vault discovery failed." });
  }

  private render(): void {
    const frame = this.resetFrame();
    this.renderHeader(frame, this.vaults.length > 0);

    if (this.vaults.length === 0) {
      const empty = frame.createDiv({ cls: "feldspar-empty" });
      setIcon(empty.createDiv({ cls: "feldspar-empty-icon" }), "folder-search");
      empty.createEl("h3", { text: "No local vaults found" });
      empty.createEl("p", {
        text: "Add one or more folders in Feldspar settings, then refresh. The scan looks for folders that contain .obsidian.",
      });
      const button = empty.createEl("button", { cls: "mod-cta", text: "Open settings" });
      button.addEventListener("click", () => this.openSettings());
      return;
    }

    const panel = frame.createDiv({ cls: "feldspar-panel" });
    this.renderPanelBar(panel);
    this.treeEl = panel.createDiv({ cls: "feldspar-tree" });
    this.treeEl.setAttr("role", "tree");
    this.renderTree();
  }

  private renderHeader(frame: HTMLElement, withTreeControls: boolean): void {
    const header = frame.createDiv({ cls: "feldspar-header" });
    const heading = header.createDiv({ cls: "feldspar-heading" });
    setIcon(heading.createSpan({ cls: "feldspar-heading-icon" }), "map");
    heading.createEl("h2", { cls: "feldspar-title", text: "Feldspar" });

    const toolbar = header.createDiv({ cls: "feldspar-toolbar" });
    if (withTreeControls) {
      const collapseButton = this.createIconButton(toolbar, "chevrons-down-up", "Collapse all");
      collapseButton.addEventListener("click", () => this.setAllCollapsed(true));
      const expandButton = this.createIconButton(toolbar, "chevrons-up-down", "Expand all");
      expandButton.addEventListener("click", () => this.setAllCollapsed(false));
    }
    const refreshButton = this.createIconButton(toolbar, "refresh-cw", "Refresh");
    refreshButton.addEventListener("click", () => void this.refresh());
  }

  private renderPanelBar(panel: HTMLElement): void {
    const bar = panel.createDiv({ cls: "feldspar-panel-bar" });
    const stats = bar.createDiv({ cls: "feldspar-stats" });

    const registered = this.vaults.filter((vault) => vault.sources.includes("registry")).length;
    const scanned = this.vaults.filter((vault) => vault.sources.includes("scan")).length;
    this.createStat(stats, "vault", this.vaults.length, "vault", "vaults");
    this.createStat(stats, "book-marked", registered, "registered", "registered");

    if (this.plugin.settings.roots.length > 0) {
      this.createStat(stats, "folder-search", scanned, "scanned", "scanned");
    } else {
      const hint = stats.createEl("a", { cls: "feldspar-stat feldspar-stat-link", text: "Add folders to scan" });
      hint.setAttr("href", "#");
      hint.addEventListener("click", (event) => {
        event.preventDefault();
        this.openSettings();
      });
    }

    const search = bar.createDiv({ cls: "feldspar-search" });
    setIcon(search.createSpan({ cls: "feldspar-search-icon" }), "search");
    const input = search.createEl("input", { cls: "feldspar-search-input", type: "search" });
    input.setAttr("placeholder", "Filter vaults");
    input.setAttr("spellcheck", "false");
    input.value = this.filterQuery;
    input.addEventListener("input", () => {
      this.filterQuery = input.value;
      this.renderTree();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && input.value) {
        event.preventDefault();
        input.value = "";
        this.filterQuery = "";
        this.renderTree();
      }
    });
  }

  private createStat(container: HTMLElement, icon: string, count: number, singular: string, plural: string): void {
    const stat = container.createSpan({ cls: "feldspar-stat" });
    setIcon(stat.createSpan({ cls: "feldspar-stat-icon" }), icon);
    stat.createSpan({ cls: "feldspar-stat-count", text: String(count) });
    stat.createSpan({ text: count === 1 ? singular : plural });
  }

  // ------------------------------------------------------------------ tree

  private renderTree(): void {
    if (!this.treeEl) {
      return;
    }
    this.treeEl.empty();

    const filtering = this.filterQuery.trim().length > 0;
    const nodes = filtering ? filterVaultTree(this.tree, this.filterQuery) : this.tree;
    this.treeEl.toggleClass("is-filtering", filtering);

    if (nodes.length === 0) {
      const state = this.treeEl.createDiv({ cls: "feldspar-state" });
      setIcon(state.createSpan({ cls: "feldspar-state-icon" }), "search-x");
      state.createSpan({ text: `No vaults match “${this.filterQuery.trim()}”.` });
      return;
    }

    for (const node of nodes) {
      this.renderNode(this.treeEl, node, filtering);
    }
  }

  private renderNode(container: HTMLElement, node: VaultTreeNode, filtering: boolean): void {
    const hasChildren = node.children.length > 0;
    const isCollapsed = hasChildren && !filtering && this.collapsed.has(node.path);

    const item = container.createDiv({ cls: "feldspar-node" });
    item.toggleClass("is-collapsed", isCollapsed);
    item.toggleClass("is-vault", Boolean(node.vault));
    item.setAttr("role", "treeitem");
    item.setAttr("aria-level", String(node.depth + 1));
    if (hasChildren) {
      item.setAttr("aria-expanded", String(!isCollapsed));
    }

    const row = item.createDiv({ cls: "feldspar-row" });
    row.style.setProperty("--vm-depth", String(node.depth));
    row.setAttr("tabindex", "0");
    row.setAttr("title", node.path);

    const chevron = row.createSpan({ cls: "feldspar-chevron" });
    if (hasChildren) {
      setIcon(chevron, "chevron-right");
      chevron.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleCollapsed(node.path);
      });
    }

    const icon = row.createSpan({ cls: "feldspar-icon" });
    this.setIconWithFallback(icon, node.vault ? "vault" : isCollapsed ? "folder" : "folder-open", "box");

    this.renderLabel(row, node);

    if (node.vault) {
      this.renderVaultDetails(row, node.vault);
    } else if (hasChildren) {
      const count = row.createSpan({ cls: "feldspar-count" });
      count.setText(`${node.vaultCount} ${node.vaultCount === 1 ? "vault" : "vaults"}`);
    }

    row.addEventListener("click", () => {
      if (hasChildren && !filtering) {
        this.toggleCollapsed(node.path);
      }
    });
    row.addEventListener("keydown", (event) => this.handleRowKey(event, node, hasChildren, filtering));

    if (hasChildren) {
      const children = item.createDiv({ cls: "feldspar-children" });
      children.setAttr("role", "group");
      for (const child of node.children) {
        this.renderNode(children, child, filtering);
      }
    }
  }

  private renderLabel(row: HTMLElement, node: VaultTreeNode): void {
    const label = row.createSpan({ cls: "feldspar-label" });
    const last = node.segments.length - 1;

    node.segments.forEach((segment, index) => {
      // A filesystem root such as "/" or "C:\\" already ends in a separator.
      if (index > 0 && !/[\\/]$/.test(node.segments[index - 1])) {
        label.createSpan({ cls: "feldspar-separator", text: "/" });
      }
      label.createSpan({
        cls: index === last ? "feldspar-segment is-last" : "feldspar-segment",
        text: segment,
      });
    });
  }

  private renderVaultDetails(row: HTMLElement, vault: DiscoveredVault): void {
    const isCurrent = vault.sources.includes("active");
    const badges = row.createSpan({ cls: "feldspar-badges" });
    for (const source of vault.sources) {
      const badge = badges.createSpan({ cls: "feldspar-badge", text: SOURCE_LABELS[source] });
      badge.toggleClass("is-current", source === "active");
    }

    const actions = row.createSpan({ cls: "feldspar-actions" });
    const revealLabel = Platform.isMacOS ? "Reveal in Finder" : "Show in folder";
    const revealButton = this.createIconButton(actions, "folder-symlink", revealLabel);
    revealButton.addClass("feldspar-reveal");
    revealButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.revealVault(vault);
    });

    if (isCurrent) {
      return;
    }

    const openButton = actions.createEl("button", { cls: "feldspar-open", text: "Open" });
    openButton.setAttr("aria-label", `Open ${vault.name}`);
    openButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.openVault(vault);
    });
  }

  // --------------------------------------------------------------- actions

  private handleRowKey(event: KeyboardEvent, node: VaultTreeNode, hasChildren: boolean, filtering: boolean): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        if (node.vault && !node.vault.sources.includes("active")) {
          this.openVault(node.vault);
        } else if (hasChildren && !filtering) {
          this.toggleCollapsed(node.path);
        }
        break;
      case "ArrowRight":
        if (hasChildren && !filtering && this.collapsed.has(node.path)) {
          event.preventDefault();
          this.toggleCollapsed(node.path);
        }
        break;
      case "ArrowLeft":
        if (hasChildren && !filtering && !this.collapsed.has(node.path)) {
          event.preventDefault();
          this.toggleCollapsed(node.path);
        }
        break;
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        this.focusSibling(event.currentTarget as HTMLElement, event.key === "ArrowDown" ? 1 : -1);
        break;
      }
    }
  }

  private focusSibling(row: HTMLElement, direction: 1 | -1): void {
    if (!this.treeEl) {
      return;
    }
    const rows = Array.from(this.treeEl.querySelectorAll<HTMLElement>(".feldspar-row")).filter(
      (candidate) => candidate.offsetParent !== null,
    );
    const index = rows.indexOf(row);
    const next = rows[index + direction];
    next?.focus();
  }

  private toggleCollapsed(path: string): void {
    if (this.collapsed.has(path)) {
      this.collapsed.delete(path);
    } else {
      this.collapsed.add(path);
    }
    this.renderTree();
  }

  private setAllCollapsed(collapsed: boolean): void {
    this.collapsed.clear();
    if (collapsed) {
      for (const path of collectFolderPaths(this.tree)) {
        this.collapsed.add(path);
      }
    }
    this.renderTree();
  }

  private openVault(vault: DiscoveredVault): void {
    const url = `obsidian://open?path=${encodeURIComponent(vault.path)}`;
    const opened = window.open(url, "_blank");

    if (!opened) {
      new Notice(`Could not open ${vault.name}.`);
    }
  }

  private revealVault(vault: DiscoveredVault): void {
    const electron = (window as unknown as { require?: (id: string) => { shell?: { showItemInFolder(path: string): void } } })
      .require?.("electron");
    if (electron?.shell) {
      electron.shell.showItemInFolder(vault.path);
      return;
    }
    new Notice(`Could not reveal ${vault.name}.`);
  }

  private openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    setting?.open();
    setting?.openTabById(this.plugin.manifest.id);
  }

  // --------------------------------------------------------------- helpers

  private createIconButton(container: HTMLElement, icon: string, label: string): HTMLButtonElement {
    const button = container.createEl("button", { cls: "feldspar-icon-button clickable-icon" });
    button.setAttr("aria-label", label);
    button.setAttr("title", label);
    this.setIconWithFallback(button, icon, "circle");
    return button;
  }

  /** Older Obsidian builds ship fewer Lucide icons, so fall back when one is missing. */
  private setIconWithFallback(element: HTMLElement, icon: string, fallback: string): void {
    setIcon(element, icon);
    if (element.childElementCount === 0) {
      setIcon(element, fallback);
    }
  }
}
