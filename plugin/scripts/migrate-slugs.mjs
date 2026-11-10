#!/usr/bin/env node
// Rename / remove WordPress preset slugs across a theme, and generate the
// database commands for content that already uses the old slugs.
//
//   npm run migrate -- <theme-dir> <slug-map.json>            # dry run: report only
//   npm run migrate -- <theme-dir> <slug-map.json> --write    # rewrite theme files
//
// Slug map format (every section optional):
//
// {
//   "color":         { "background": "base", "highlight": "accent" },
//   "spacing":       { "padding-md": "40", "ui-header": "var(--wp--custom--ui--header)" },
//   "font-size":     { "huge": "xx-large" },
//   "font-family":   { "body": "copy" },
//   "border-radius": { "md": "medium" },
//   "replace":       { "--wp--custom--container--max-w-ch": "--wp--style--global--content-size" }
// }
//
// - "old": "new"            → the old preset is renamed / merged into "new".
// - "old": "var(...)"       → the old preset is removed; references become that CSS value.
// - "replace"               → plain text replacements (e.g. custom CSS variables).
//
// What it does:
//   1. theme.json + styles/*.json: removes the old presets (renames them in
//      place when the new slug doesn't exist yet).
//   2. Every theme file (json, html, php, css, js, scss): rewrites references:
//        var:preset|spacing|padding-md     (block attributes)
//        var(--wp--preset--spacing--padding-md)
//        has-background-color, has-highlight-background-color, has-huge-font-size…
//        "textColor":"background", "fontSize":"huge", "fontFamily":"body"…
//   3. Writes slug-migration.sh next to the slug map: `wp search-replace`
//      commands (with --dry-run) for posts, patterns and templates in the DB.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, extname, basename } from "node:path";

const [themeDir, mapPath, flag] = process.argv.slice(2);
if (!themeDir || !mapPath) {
	console.error("Usage: npm run migrate -- <theme-dir> <slug-map.json> [--write]");
	process.exit(1);
}
const write = flag === "--write";
const map = JSON.parse(readFileSync(mapPath, "utf8"));

const PRESET_TYPES = ["color", "gradient", "font-size", "font-family", "spacing", "border-radius"];
const THEME_JSON_PATHS = {
	color: ["color", "palette"],
	gradient: ["color", "gradients"],
	"font-size": ["typography", "fontSizes"],
	"font-family": ["typography", "fontFamilies"],
	spacing: ["spacing", "spacingSizes"],
	"border-radius": ["border", "radiusSizes"],
};
// Block attributes that store a slug directly, per preset type.
const SLUG_ATTRIBUTES = {
	color: ["textColor", "backgroundColor", "borderColor", "overlayColor"],
	gradient: ["gradient"],
	"font-size": ["fontSize"],
	"font-family": ["fontFamily"],
};
// Utility classes WordPress generates, per preset type.
const CLASS_SUFFIXES = {
	color: ["color", "background-color", "border-color"],
	gradient: ["gradient-background"],
	"font-size": ["font-size"],
	"font-family": ["font-family"],
};

/** How WordPress turns a slug into a CSS variable segment (_wp_to_kebab_case). */
const cssSegment = (slug) =>
	slug.replace(/([a-z])([0-9])/g, "$1-$2").replace(/([0-9])([a-z])/g, "$1-$2");
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const END = "(?![a-z0-9-])"; // so "accent" doesn't match "accent-1"

/** Build every replacement rule from the map. */
function buildRules() {
	const rules = []; // { pattern: RegExp, to: string, label, db: [from, to][] }
	for (const type of PRESET_TYPES) {
		for (const [from, to] of Object.entries(map[type] ?? {})) {
			const isRaw = to.startsWith("var(") || to.startsWith("--");
			const toVar = isRaw ? to : `var(--wp--preset--${type}--${cssSegment(to)})`;
			const label = `${type}: ${from} → ${to}`;

			// Block attribute values: "var:preset|spacing|padding-md"
			rules.push({
				label,
				pattern: new RegExp(`var:preset\\|${escape(type)}\\|${escape(from)}${END}`, "g"),
				to: isRaw ? toVar : `var:preset|${type}|${to}`,
				db: [[`var:preset|${type}|${from}"`, isRaw ? `${toVar}"` : `var:preset|${type}|${to}"`]],
			});
			// CSS custom properties
			rules.push({
				label,
				pattern: new RegExp(`var\\(--wp--preset--${escape(type)}--${escape(cssSegment(from))}\\)`, "g"),
				to: toVar,
				db: [[`var(--wp--preset--${type}--${cssSegment(from)})`, toVar]],
			});
			rules.push({
				label,
				pattern: new RegExp(`--wp--preset--${escape(type)}--${escape(cssSegment(from))}${END}`, "g"),
				to: isRaw ? to.replace(/^var\((.*)\)$/, "$1") : `--wp--preset--${type}--${cssSegment(to)}`,
				db: [],
			});

			if (isRaw) continue; // classes and slug attributes need a real preset

			for (const attr of SLUG_ATTRIBUTES[type] ?? []) {
				rules.push({
					label,
					pattern: new RegExp(`"${attr}":"${escape(from)}"`, "g"),
					to: `"${attr}":"${to}"`,
					db: [[`"${attr}":"${from}"`, `"${attr}":"${to}"`]],
				});
			}
			for (const suffix of CLASS_SUFFIXES[type] ?? []) {
				rules.push({
					label,
					pattern: new RegExp(`(?<![a-z0-9-])has-${escape(from)}-${suffix}${END}`, "g"),
					to: `has-${to}-${suffix}`,
					db: [[`has-${from}-${suffix}`, `has-${to}-${suffix}`]],
				});
			}
		}
	}
	for (const [from, to] of Object.entries(map.replace ?? {})) {
		rules.push({
			label: `replace: ${from} → ${to}`,
			pattern: new RegExp(`${escape(from)}${END}`, "g"),
			to,
			db: [[from, to]],
		});
	}
	return rules;
}

/** Remove (or rename) migrated presets in a theme.json-shaped object. */
function migratePresets(json, file, log) {
	const settings = json.settings;
	if (!settings) return;
	for (const type of PRESET_TYPES) {
		const [section, key] = THEME_JSON_PATHS[type];
		const list = settings[section]?.[key];
		if (!Array.isArray(list)) continue;
		const slugs = new Set(list.map((p) => p.slug));
		settings[section][key] = list.flatMap((preset) => {
			const to = map[type]?.[preset.slug];
			if (to === undefined) return [preset];
			const isRaw = to.startsWith("var(") || to.startsWith("--");
			if (!isRaw && !slugs.has(to)) {
				log.push(`${file}: renamed ${type} "${preset.slug}" → "${to}"`);
				slugs.add(to);
				return [{ ...preset, slug: to }];
			}
			log.push(`${file}: removed ${type} "${preset.slug}" (now ${to})`);
			return [];
		});
	}
}

const TEXT_EXTENSIONS = new Set([".json", ".html", ".php", ".css", ".scss", ".js", ".jsx", ".ts", ".tsx"]);
const SKIP_DIRS = new Set(["node_modules", "vendor", ".git", "build", "dist"]);

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : walk(path);
		return TEXT_EXTENSIONS.has(extname(name)) ? [path] : [];
	});
}

const rules = buildRules();
const presetLog = [];
const changes = new Map(); // file → { label → count }

for (const file of walk(themeDir)) {
	const rel = relative(themeDir, file);
	let text = readFileSync(file, "utf8");
	const original = text;

	const isThemeJson = basename(file) === "theme.json" || /(^|\/)styles\/.+\.json$/.test(rel);
	if (isThemeJson) {
		try {
			const json = JSON.parse(text);
			migratePresets(json, rel, presetLog);
			const indent = text.match(/^[ \t]+/m)?.[0] ?? "\t";
			text = JSON.stringify(json, null, indent) + "\n";
		} catch {
			presetLog.push(`${rel}: not valid JSON – presets left alone, references still rewritten`);
		}
	}

	for (const rule of rules) {
		text = text.replace(rule.pattern, () => {
			const counts = changes.get(rel) ?? {};
			counts[rule.label] = (counts[rule.label] ?? 0) + 1;
			changes.set(rel, counts);
			return rule.to;
		});
	}

	if (write && text !== original) writeFileSync(file, text);
}

// Report
console.log(write ? "Theme files updated:\n" : "Dry run – nothing written. Changes that --write would make:\n");
presetLog.forEach((line) => console.log(`  • ${line}`));
for (const [file, counts] of changes) {
	console.log(`  ${file}`);
	for (const [label, count] of Object.entries(counts)) console.log(`      ${count}× ${label}`);
}
if (!presetLog.length && !changes.size) console.log("  (no references found)");

// Database commands
const dbPairs = [];
const seen = new Set();
for (const rule of rules) {
	for (const [from, to] of rule.db) {
		if (!seen.has(from)) {
			seen.add(from);
			dbPairs.push([from, to]);
		}
	}
}
const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const script = [
	"#!/usr/bin/env bash",
	"# Generated by scripts/migrate-slugs.mjs",
	"# Rewrites old preset slugs in the database (posts, patterns, template edits, global styles).",
	"# 1. Back up the database:   wp db export before-slug-migration.sql",
	"# 2. Run as-is (dry run) and check the counts.",
	"# 3. Remove DRY_RUN below and run again.",
	"set -euo pipefail",
	'DRY_RUN="--dry-run"',
	"",
	...dbPairs.map(
		([from, to]) =>
			`wp search-replace ${quote(from)} ${quote(to)} --all-tables-with-prefix --skip-columns=guid --report-changed-only $DRY_RUN`,
	),
	"",
].join("\n");
const scriptPath = join(dirname(mapPath), "slug-migration.sh");
writeFileSync(scriptPath, script, { mode: 0o755 });
console.log(`\nDatabase commands (${dbPairs.length}): ${scriptPath}`);
