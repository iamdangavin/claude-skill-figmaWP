#!/usr/bin/env node
// Post a Figma comment pinned to a node via the REST API (optional drift notifications).
// Only used when FIGMA_TOKEN is set; the default drift report is Dev Mode annotations.
//
//   FIGMA_TOKEN=… node figma-comment.mjs <fileKey> <nodeId> <message-file|->
//
// The token is read from the environment only and never written anywhere.

import { readFileSync } from 'node:fs';

const [fileKey, nodeId, msgSource] = process.argv.slice(2);
const token = process.env.FIGMA_TOKEN;

if (!token) {
  console.error('FIGMA_TOKEN is not set; skipping comment (annotations remain the drift record).');
  process.exit(3);
}
if (!fileKey || !nodeId || !msgSource) {
  console.error('Usage: figma-comment.mjs <fileKey> <nodeId> <message-file|->');
  process.exit(1);
}

const message = readFileSync(msgSource === '-' ? 0 : msgSource, 'utf8').trim();
const res = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/comments`, {
  method: 'POST',
  headers: { 'X-Figma-Token': token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message,
    client_meta: { node_id: nodeId.replace('-', ':'), node_offset: { x: 0, y: 0 } },
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Figma API ${res.status}: ${body.err ?? body.message ?? res.statusText}`);
  process.exit(1);
}
console.log(JSON.stringify({ id: body.id, node: nodeId }));
