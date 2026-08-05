import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');

/**
 * Returns the body of every top-level `async function handleX(...)` in App.tsx,
 * keyed by name. The handlers are all authored at one indent level inside the
 * component, so a closing `  }` at that indent ends the body.
 */
function readHandlerBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const opener = /^ {2}(?:async )?function (handle\w+)\([^\n]*\{$/gm;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    const start = match.index + match[0].length;
    const end = source.indexOf('\n  }\n', start);
    if (end === -1) {
      throw new Error(`Could not find the end of ${match[1]}`);
    }
    bodies.set(match[1], source.slice(start, end));
  }
  return bodies;
}

describe('parent setting writes reach the cloud', () => {
  const handlers = readHandlerBodies(appSource);

  it('finds the handlers it is meant to be guarding', () => {
    // A rename that silently emptied this list would make every assertion
    // below vacuously true.
    const writers = [...handlers]
      .filter(([, body]) => body.includes('saveParentSetting('))
      .map(([name]) => name);

    expect(writers).toContain('handleEquipBackpackItem');
    expect(writers).toContain('handleSelectProfile');
    expect(writers).toContain('handleUpdateSetting');
  });

  it('asks for a sync after every parent setting write', () => {
    // saveParentSetting only marks the change pending. Without a push the
    // child equips a backpack item on the iPad and the phone keeps the old
    // one until something else happens to sync — which was the bug.
    for (const [name, body] of handlers) {
      if (!body.includes('saveParentSetting(')) continue;
      expect(`${name}: ${body.includes('onRequestSync')}`).toBe(`${name}: true`);
    }
  });
});
