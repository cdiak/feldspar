import {
  App,
  FileSystemAdapter,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";

import type { DiscoveredVault, FeldsparSettings } from "./src/types";
import {
  defaultExcludedDirectories,
  defaultRegistryPath,
  discoverVaults,
} from "./src/vault-discovery";
import { FELDSPAR_VIEW_TYPE, FeldsparView } from "./src/feldspar-view";

const DEFAULT_SETTINGS: FeldsparSettings = {
  excludedDirectoryNames: defaultExcludedDirectories(),
  maxDepth: 5,
  openOnStartup: true,
  roots: [],
};

export default class FeldsparPlugin extends Plugin {
  settings: FeldsparSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(FELDSPAR_VIEW_TYPE, (leaf) => new FeldsparView(leaf, this));
    this.addRibbonIcon("map", "Open Feldspar", () => void this.activateView());
    this.addCommand({
      id: "open-feldspar",
      name: "Open vault map",
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "refresh-feldspar",
      name: "Refresh vault map",
      callback: () => void this.refreshOpenViews(),
    });
    this.addSettingTab(new FeldsparSettingTab(this.app, this));

    if (this.settings.openOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.activateView());
    }
  }

  async getVaults(): Promise<DiscoveredVault[]> {
    return discoverVaults({
      activeVaultPath: this.getActiveVaultPath(),
      excludedDirectoryNames: this.settings.excludedDirectoryNames,
      maxDepth: this.settings.maxDepth,
      registryPath: defaultRegistryPath(),
      roots: this.settings.roots,
    });
  }

  async activateView(): Promise<void> {
    const existingLeaf = this.app.workspace.getLeavesOfType(FELDSPAR_VIEW_TYPE)[0];
    const leaf = existingLeaf ?? this.app.workspace.getLeaf("tab");

    await leaf.setViewState({ active: true, type: FELDSPAR_VIEW_TYPE });
    this.app.workspace.revealLeaf(leaf);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await this.refreshOpenViews();
  }

  async refreshOpenViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(FELDSPAR_VIEW_TYPE);
    await Promise.all(leaves.map(async (leaf) => {
      const view = leaf.view;
      if (view instanceof FeldsparView) {
        await view.refresh();
      }
    }));
  }

  private getActiveVaultPath(): string | undefined {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : undefined;
  }

  private async loadSettings(): Promise<void> {
    const savedSettings = await this.loadData() as Partial<FeldsparSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
      excludedDirectoryNames: savedSettings?.excludedDirectoryNames ?? defaultExcludedDirectories(),
      roots: savedSettings?.roots ?? [],
    };
  }
}

class FeldsparSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: FeldsparPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      text: "Feldspar only reads the Obsidian registry and the folders listed below. It never edits another vault.",
    });

    new Setting(containerEl)
      .setName("Folders to scan")
      .setDesc("One absolute path per line. Feldspar searches these folders for .obsidian directories.")
      .addTextArea((text) => {
        text
          .setPlaceholder("/Users/you/Documents\n/Volumes/Archive/Notes")
          .setValue(this.plugin.settings.roots.join("\n"));
        text.inputEl.rows = 5;
        text.inputEl.addEventListener("input", () => {
          const value = text.getValue();
          this.plugin.settings.roots = value
            .split("\n")
            .map((root) => root.trim())
            .filter(Boolean);
        });
        text.inputEl.addEventListener("blur", () => void this.plugin.saveSettings());
      });

    new Setting(containerEl)
      .setName("Maximum scan depth")
      .setDesc("Limits how far below each selected folder discovery will look.")
      .addSlider((slider) => slider
        .setLimits(1, 12, 1)
        .setValue(this.plugin.settings.maxDepth)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxDepth = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Excluded folder names")
      .setDesc("Comma-separated folder names to skip everywhere during a scan.")
      .addText((text) => {
        text.setValue(this.plugin.settings.excludedDirectoryNames.join(", "));
        text.inputEl.addEventListener("input", () => {
          const value = text.getValue();
          this.plugin.settings.excludedDirectoryNames = value
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean);
        });
        text.inputEl.addEventListener("blur", () => void this.plugin.saveSettings());
      });

    new Setting(containerEl)
      .setName("Open on startup")
      .setDesc("Open Feldspar when this vault starts.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.openOnStartup)
        .onChange(async (value) => {
          this.plugin.settings.openOnStartup = value;
          await this.plugin.saveSettings();
        }));
  }
}
