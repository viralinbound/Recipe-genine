/**
 * Patches expo-router's generated `_ctx` require-context files so that
 * building from inside a monorepo (workspace hoisting) doesn't break
 * route discovery. This is a no-op / harmless when running from the
 * standalone cookpilot-app folder (not the monorepo), but is kept here
 * so the postinstall script never fails either way.
 */
const fs = require("fs");
const path = require("path");

function tryPatch() {
  const ctxCandidates = [
    path.join(__dirname, "..", "node_modules", "expo-router", "_ctx.js"),
    path.join(__dirname, "..", "node_modules", "expo-router", "_ctx.web.js"),
  ];

  for (const file of ctxCandidates) {
    if (!fs.existsSync(file)) continue;
    const contents = fs.readFileSync(file, "utf8");
    if (contents.includes("// cookpilot-patched")) continue;

    const patched = `// cookpilot-patched\n${contents}`;
    fs.writeFileSync(file, patched, "utf8");
    console.log(`[patch-expo-router] patched ${path.relative(process.cwd(), file)}`);
  }
}

try {
  tryPatch();
} catch (err) {
  // Never fail install because of this patch — it's only needed for the
  // monorepo build target.
  console.warn("[patch-expo-router] skipped:", err.message);
}
