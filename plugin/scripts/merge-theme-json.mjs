#!/usr/bin/env node
// Merge the Figma export into a theme's hand-written theme.json.
//
//   npm run merge -- <theme.json> <figma-export.json> [--write]
//
// Rules:
//   - Objects are merged deeply; values from the export win.
//   - Preset arrays (items with a "slug") are merged BY SLUG, field by field,
//     so hand-written extras such as fontFace survive. Presets that exist
//     only in the theme are kept and listed, so nothing disappears silently.
//   - Any other array is replaced by the export's version.
//   - Everything the export doesn't mention (appearanceTools, element and
//     block styles, templates…) is left alone.
//
// Without --write the merged JSON is printed to stdout.

import { readFileSync, writeFileSync } from "node:fs";

const [themePath, exportPath, flag] = process.argv.slice(2);
if (!themePath || !exportPath) {
	console.error("Usage: npm run merge -- <theme.json> <figma-export.json> [--write]");
	process.exit(1);
}

const theme = JSON.parse(readFileSync(themePath, "utf8"));
const generated = JSON.parse(readFileSync(exportPath, "utf8"));
const keptOnlyInTheme = [];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isPresetArray = (v) => Array.isArray(v) && v.length > 0 && v.every((i) => isObject(i) && "slug" in i);

function mergePresets(base, incoming, path) {
	const bySlug = new Map(base.map((item) => [item.slug, item]));
	const merged = incoming.map((item) => ({ ...(bySlug.get(item.slug) ?? {}), ...item }));
	const incomingSlugs = new Set(incoming.map((i) => i.slug));
	for (const item of base) {
		if (!incomingSlugs.has(item.slug)) {
			merged.push(item);
			keptOnlyInTheme.push(`${path}: ${item.slug}`);
		}
	}
	return merged;
}

function merge(base, incoming, path = "") {
	if (isObject(base) && isObject(incoming)) {
		const out = { ...base };
		for (const [key, value] of Object.entries(incoming)) {
			out[key] = key in base ? merge(base[key], value, path ? `${path}.${key}` : key) : value;
		}
		return out;
	}
	if (isPresetArray(base) && isPresetArray(incoming)) return mergePresets(base, incoming, path);
	return incoming;
}

const result = merge(theme, generated);
const output = JSON.stringify(result, null, "\t") + "\n";

if (flag === "--write") {
	writeFileSync(themePath, output);
	console.error(`Updated ${themePath}`);
} else {
	process.stdout.write(output);
}

if (keptOnlyInTheme.length) {
	console.error("\nPresets kept from the theme that aren't in Figma (remove them if they're obsolete):");
	keptOnlyInTheme.forEach((p) => console.error(`  - ${p}`));
}
