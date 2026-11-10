#!/usr/bin/env node
// figmawp: registers the figmaWP Claude Code plugin from this npm package.
//
//   figmawp install     add this package as the "figmawp" marketplace, install figmaWP,
//                       and copy /discovery to ~/.claude/skills if it is missing
//   figmawp update      refresh the marketplace and plugin after `npm update -g`
//   figmawp uninstall   remove the plugin and marketplace (leaves /discovery alone)
//   figmawp doctor      show what is installed and what is missing

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKETPLACE = 'figmawp';
const PLUGIN_ID = `figmaWP@${MARKETPLACE}`;
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const DISCOVERY_DIR = join(CLAUDE_DIR, 'skills', 'discovery');

const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const fail = (m) => { console.error(`  ✗ ${m}`); process.exitCode = 1; };

function claude(args, { quiet = false } = {}) {
  const r = spawnSync('claude', args, { encoding: 'utf8' });
  if (r.error) {
    fail('`claude` CLI not found on PATH. Install Claude Code first: https://claude.com/claude-code');
    process.exit(1);
  }
  if (!quiet && r.status !== 0) warn((r.stderr || r.stdout).trim().split('\n').slice(-3).join('\n    '));
  return r;
}

function marketplaceRegistered() {
  const r = claude(['plugin', 'marketplace', 'list'], { quiet: true });
  return r.status === 0 && new RegExp(`\\b${MARKETPLACE}\\b`).test(r.stdout);
}

function pluginInstalled() {
  const r = claude(['plugin', 'list'], { quiet: true });
  return r.status === 0 && r.stdout.includes(PLUGIN_ID);
}

function installDiscovery() {
  if (existsSync(join(DISCOVERY_DIR, 'SKILL.md'))) {
    ok(`/discovery already present at ${DISCOVERY_DIR}, left untouched`);
    return;
  }
  mkdirSync(DISCOVERY_DIR, { recursive: true });
  copyFileSync(join(PKG_ROOT, 'vendor', 'discovery', 'SKILL.md'), join(DISCOVERY_DIR, 'SKILL.md'));
  ok(`/discovery installed to ${DISCOVERY_DIR}`);
}

function install() {
  console.log('Installing figmaWP…');
  if (marketplaceRegistered()) {
    claude(['plugin', 'marketplace', 'update', MARKETPLACE]);
    ok(`marketplace "${MARKETPLACE}" already registered, refreshed`);
  } else if (claude(['plugin', 'marketplace', 'add', PKG_ROOT]).status === 0) {
    ok(`marketplace "${MARKETPLACE}" → ${PKG_ROOT}`);
  } else {
    return fail('could not register the marketplace');
  }

  if (pluginInstalled()) ok(`${PLUGIN_ID} already installed`);
  else if (claude(['plugin', 'install', PLUGIN_ID]).status === 0) ok(`${PLUGIN_ID} installed`);
  else return fail(`could not install ${PLUGIN_ID}`);

  installDiscovery();
  console.log('\nRestart Claude Code, then run /figmaWP:bootstrap in a child theme repo.');
}

function update() {
  console.log('Updating figmaWP…');
  claude(['plugin', 'marketplace', 'update', MARKETPLACE]);
  if (claude(['plugin', 'update', PLUGIN_ID]).status === 0) ok(`${PLUGIN_ID} updated (restart Claude Code to apply)`);
  installDiscovery();
}

function uninstall() {
  console.log('Uninstalling figmaWP…');
  if (pluginInstalled() && claude(['plugin', 'uninstall', PLUGIN_ID]).status === 0) ok(`${PLUGIN_ID} removed`);
  if (marketplaceRegistered() && claude(['plugin', 'marketplace', 'remove', MARKETPLACE]).status === 0) ok(`marketplace "${MARKETPLACE}" removed`);
  console.log(`  /discovery at ${DISCOVERY_DIR} was left in place (it may be your own copy).`);
}

function doctor() {
  console.log(`figmaWP doctor (package: ${PKG_ROOT})`);
  marketplaceRegistered() ? ok(`marketplace "${MARKETPLACE}" registered`) : fail(`marketplace "${MARKETPLACE}" missing: run \`figmawp install\``);
  pluginInstalled() ? ok(`${PLUGIN_ID} installed`) : fail(`${PLUGIN_ID} missing: run \`figmawp install\``);
  existsSync(join(DISCOVERY_DIR, 'SKILL.md')) ? ok('/discovery present') : fail('/discovery missing: run `figmawp install`');
  const wp = spawnSync('wp', ['--version'], { encoding: 'utf8' });
  wp.status === 0 ? ok(`wp-cli: ${wp.stdout.trim().split('\n').filter((l) => /^WP-CLI/.test(l)).pop() ?? 'found'}`) : warn('wp-cli not found (needed for local dev checks)');
  existsSync('/usr/bin/safaridriver') ? ok('safaridriver available for the Safari MCP') : warn('safaridriver not found (macOS Safari only)');
  process.env.FIGMA_TOKEN ? ok('FIGMA_TOKEN set (drift comments enabled)') : console.log('  · FIGMA_TOKEN not set (drift is reported as annotations only)');
}

const commands = { install, update, uninstall, doctor };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.log('Usage: figmawp <install|update|uninstall|doctor>');
  process.exit(cmd ? 1 : 0);
}
commands[cmd]();
