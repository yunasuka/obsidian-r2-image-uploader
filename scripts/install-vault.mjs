// Copies the build into a vault for local testing: npm run install-vault -- <vault path>
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const vault = process.argv[2] ?? process.env.OBSIDIAN_VAULT;
if (!vault) {
	console.error("usage: npm run install-vault -- <vault path>   (or set OBSIDIAN_VAULT)");
	process.exit(1);
}
const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
const dir = join(vault, ".obsidian", "plugins", id);
mkdirSync(dir, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(f, join(dir, f));
console.log("installed to", dir);
