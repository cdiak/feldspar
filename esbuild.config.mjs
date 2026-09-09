import esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  outfile: "main.js",
  platform: "browser",
  format: "cjs",
  target: "es2020",
  sourcemap: false,
  external: ["obsidian", "fs", "fs/promises", "os", "path"],
});

if (isWatch) {
  await context.watch();
  console.log("[esbuild] Watching Feldspar...");
} else {
  await context.rebuild();
  await context.dispose();
  console.log("[esbuild] Build complete. main.js ready.");
}
