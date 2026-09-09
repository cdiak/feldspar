# Feldspar

Feldspar is a small, local-only Obsidian desktop plugin for people who use more than one vault. It shows registered and discovered vaults in a tree that follows their real filesystem locations, then opens the selected vault with Obsidian's native URI scheme.

## What it does

- Reads Obsidian's local vault registry to find vaults already known to Obsidian.
- Recursively scans **only the folders you explicitly list** in its settings, looking for directories that contain `.obsidian`.
- Presents the results as a repo-style file tree, with one-click vault opening.
  - The tree starts at `~` for anything under your home folder.
  - Single-child folder chains collapse into one row, so `scollay-autoloans / var / vault` reads as one line.
  - Folders collapse and expand, a filter box narrows the list, and each vault row can reveal its folder in Finder.
- Runs entirely locally and has no runtime dependencies.

## What it does not do

- It does not make network requests, collect telemetry, use AI services, or load remote code.
- It does not write, rename, tag, move, index, or otherwise modify any external vault.
- It does not scan the whole computer automatically, follow symlinks, or scan beyond the configured maximum depth.

An Obsidian desktop plugin has broad local-file privileges in principle. The safety model here is deliberately simple: the complete source is short and unobfuscated, with no production dependencies; all filesystem calls are confined in `src/vault-discovery.ts` and are read-only.

## Install for development

1. Run `npm install` in this directory.
2. Run `npm run build`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into `<Home vault>/.obsidian/plugins/feldspar/`.
4. Enable **Feldspar** in **Settings → Community plugins**.
5. In **Feldspar** settings, add the folder roots that contain your vaults.

Use a dedicated Home vault for the best experience and leave **Open on startup** enabled. Obsidian plugins run inside one vault, so a Home vault is the appropriate place for a cross-vault control surface.

## Development checks

```bash
npm run check
npm run build
```

## Next increments

The next useful features are read-only global search, recent-note listings, and an opt-in agent inbox. Those should retain the same safety model: explicit folders, transparent proposal previews, and no external-vault writes without a separate user action.

## License

MIT. See `LICENSE`.
