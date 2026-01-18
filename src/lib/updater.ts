import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  newVersion?: string;
  releaseNotes?: string;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    console.log('[Updater] Checking for updates...');
    const update = await check();
    console.log('[Updater] Result:', update);

    if (update) {
      return {
        available: true,
        currentVersion: update.currentVersion,
        newVersion: update.version,
        releaseNotes: update.body || undefined
      };
    }

    return {
      available: false,
      currentVersion: 'unknown'
    };
  } catch (error) {
    console.error('[Updater] Error:', error);
    throw error; // Re-throw so layout can catch and display
  }
}

export async function downloadAndInstallUpdate(): Promise<boolean> {
  try {
    const update = await check();

    if (!update) {
      return false;
    }

    const confirmed = await ask(
      `A new version (${update.version}) is available. Would you like to download and install it now?\n\n${update.body || 'No release notes available.'}`,
      {
        title: 'Update Available',
        kind: 'info',
        okLabel: 'Update Now',
        cancelLabel: 'Later'
      }
    );

    if (!confirmed) {
      return false;
    }

    // Download and install the update
    await update.downloadAndInstall();

    // Ask to restart
    const restart = await ask(
      'Update installed successfully. Restart now to apply the update?',
      {
        title: 'Restart Required',
        kind: 'info',
        okLabel: 'Restart',
        cancelLabel: 'Later'
      }
    );

    if (restart) {
      await relaunch();
    }

    return true;
  } catch (error) {
    console.error('Failed to download/install update:', error);
    return false;
  }
}

export async function checkAndPromptForUpdate(): Promise<void> {
  const updateInfo = await checkForUpdates();

  if (updateInfo.available) {
    await downloadAndInstallUpdate();
  }
}
