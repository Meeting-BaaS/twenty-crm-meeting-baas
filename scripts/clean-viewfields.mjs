#!/usr/bin/env node

/**
 * Deletes all viewField records from the "All Recordings" and "Completed Recordings"
 * views via the metadata GraphQL API. Run this before `twenty install` on update
 * installs to avoid viewField uniqueness conflicts.
 *
 * Reads server URL and API key from ~/.twenty/config.json (same config as twenty CLI).
 * Respects the -r/--remote flag via TWENTY_REMOTE env var, otherwise uses defaultRemote.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const VIEW_NAMES = ['All Recordings', 'Completed Recordings'];

async function main() {
  // Read twenty CLI config
  const configPath = join(homedir(), '.twenty', 'config.json');
  const config = JSON.parse(await readFile(configPath, 'utf-8'));
  const remoteName = process.env.TWENTY_REMOTE || config.defaultRemote;
  const remote = config.remotes[remoteName];

  if (!remote) {
    console.error(`Remote "${remoteName}" not found in ${configPath}`);
    process.exit(1);
  }

  const { apiUrl, apiKey } = remote;
  const metadataUrl = `${apiUrl}/metadata`;

  console.log(`[clean-viewfields] Using remote "${remoteName}" (${apiUrl})`);

  const gql = async (query, variables) => {
    const res = await fetch(metadataUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    return res.json();
  };

  // Fetch views with nested viewFields
  const { data, errors } = await gql(`{
    getViews {
      id
      name
      viewFields { id }
    }
  }`);

  if (errors?.length) {
    console.error('[clean-viewfields] Failed to query views:', JSON.stringify(errors));
    process.exit(1);
  }

  const views = data?.getViews ?? [];
  let deleted = 0;
  let skipped = 0;

  for (const view of views) {
    if (!VIEW_NAMES.includes(view.name)) continue;

    console.log(`[clean-viewfields] Deleting ${view.viewFields.length} viewFields from "${view.name}"`);

    for (const vf of view.viewFields) {
      const result = await gql(
        `mutation ($input: DestroyViewFieldInput!) {
          destroyViewField(input: $input) { id }
        }`,
        { input: { id: vf.id } },
      );

      if (result.data?.destroyViewField) {
        deleted++;
      } else {
        // Label identifier fields can't be deleted — that's expected
        skipped++;
      }
    }
  }

  console.log(`[clean-viewfields] Done: ${deleted} deleted, ${skipped} skipped (protected)`);
}

main().catch((err) => {
  console.error('[clean-viewfields] Error:', err);
  process.exit(1);
});
