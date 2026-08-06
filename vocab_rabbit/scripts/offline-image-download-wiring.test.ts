import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The download does not belong to the Settings page.
 *
 * Nothing at runtime connects the page to the service worker's job: if the page
 * quietly went back to running its own loop, the download would keep working in
 * every test and every desktop browser, and only fall over on the phone it was
 * moved out of the page for -- where leaving Settings threw the progress away
 * and backgrounding the app killed the download outright.
 */
describe('offline image download wiring', () => {
  async function readSettingsPage(): Promise<string> {
    return readFile(path.resolve('src/screens/SettingsPage.tsx'), 'utf8');
  }

  it('does not run the download loop in the page', async () => {
    const source = await readSettingsPage();

    expect(source).not.toMatch(/downloadOfflineImages/);
  });

  it('drives the job through the controller instead', async () => {
    const source = await readSettingsPage();

    expect(source).toMatch(/startOfflineImageJob\(offlineImageUrls\)/);
    expect(source).toMatch(/stopOfflineImageJob\(\)/);
    expect(source).toMatch(/subscribeOfflineImageJob\(/);
  });

  // The worker is killed between slices by design, and a backgrounded page
  // misses the messages it sends in between.
  it('asks the worker to resume when the app comes back to the foreground', async () => {
    const source = await readSettingsPage();

    expect(source).toMatch(/visibilitychange/);
    expect(source).toMatch(/visibilityState === 'visible'\) resumeOfflineImageJob\(\)/);
  });

  it('keeps the progress bar reading the job rather than a stale cache count', async () => {
    const source = await readSettingsPage();

    // The cache status check runs on mount; letting it overwrite an in-flight
    // download is exactly what made re-entering Settings look like a reset.
    expect(source).toMatch(/current\.phase === 'downloading'\s*\n?\s*\? current/);
  });
});
