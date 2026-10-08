import * as esbuild from "esbuild";

const options = {
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  external: ["obsidian", "electron"],
  sourcemap: false,
  banner: { js: "/* Outline to TeX & Typst | MIT | https://github.com/MMayu1213/outline-to-tex-typst */" },
};
if (process.argv.includes("--watch")) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
