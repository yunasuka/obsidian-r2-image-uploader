import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "node_modules/", "local/", "esbuild.config.mjs", "scripts/", "test/", "eslint.config.mjs"] },
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: { projectService: true },
		},
	},
]);
