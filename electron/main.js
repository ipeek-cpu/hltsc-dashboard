import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';
import { ServerManager } from './server-manager.js';
import { PreviewManager } from './preview-manager.js';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
// ES module compatibility - define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log('[Electron Main] __dirname:', __dirname);
console.log('[Electron Main] __filename:', __filename);
let mainWindow = null;
let serverManager = null;
let previewManager = null;
const oauthServers = new Map();
// Determine if we're in development mode
const isDev = !app.isPackaged;
async function createWindow() {
    // Start the SvelteKit server
    serverManager = new ServerManager();
    await serverManager.start();
    // Create the browser window
    const preloadPath = path.join(__dirname, 'preload.js');
    console.log('[Electron Main] Preload path:', preloadPath);
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        center: true,
        title: 'Beads Dashboard',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true // Enable webview tag for preview
        },
        // macOS-specific settings
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 16, y: 16 }
    });
    // Initialize preview manager
    previewManager = new PreviewManager(mainWindow);
    // Load the app from the local server
    const serverUrl = `http://127.0.0.1:${serverManager.port}`;
    mainWindow.loadURL(serverUrl);
    // Open DevTools in development
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
        previewManager = null;
    });
}
// Set up CSP bypass for preview content
function setupCSPBypass() {
    // Only modify responses for preview requests (not the main app)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        // Check if this is a preview request (will be determined by URL pattern)
        const isPreviewRequest = details.url.includes('__beads_preview__') ||
            (previewManager && previewManager.isPreviewUrl(details.url));
        if (isPreviewRequest) {
            // Remove CSP headers that block embedding
            delete headers['content-security-policy'];
            delete headers['Content-Security-Policy'];
            delete headers['x-frame-options'];
            delete headers['X-Frame-Options'];
            delete headers['frame-ancestors'];
        }
        callback({ responseHeaders: headers });
    });
}
// Set up IPC handlers
function setupIPC() {
    // Preview controls
    ipcMain.handle('preview:load', async (_, url) => {
        if (previewManager) {
            return previewManager.loadUrl(url);
        }
        return { success: false, error: 'Preview manager not initialized' };
    });
    ipcMain.handle('preview:refresh', async () => {
        if (previewManager) {
            return previewManager.refresh();
        }
        return { success: false, error: 'Preview manager not initialized' };
    });
    ipcMain.handle('preview:open-devtools', async () => {
        if (previewManager) {
            return previewManager.openDevTools();
        }
        return { success: false, error: 'Preview manager not initialized' };
    });
    ipcMain.handle('preview:close-devtools', async () => {
        if (previewManager) {
            return previewManager.closeDevTools();
        }
        return { success: false, error: 'Preview manager not initialized' };
    });
    ipcMain.handle('preview:enable-inspector', async () => {
        if (previewManager) {
            return previewManager.enableInspector();
        }
        return { success: false, error: 'Preview manager not initialized' };
    });
    ipcMain.handle('preview:disable-inspector', async () => {
        if (previewManager) {
            return previewManager.disableInspector();
        }
        return { success: false, error: 'Preview manager not initialized' };
    });
    ipcMain.handle('preview:set-bounds', async (_, bounds) => {
        if (previewManager) {
            return previewManager.setBounds(bounds);
        }
        return { success: false, error: 'Preview manager not initialized' };
    });
    ipcMain.handle('preview:show', async () => {
        if (previewManager) {
            return previewManager.show();
        }
        return { success: false, error: 'Preview manager not initialized' };
    });
    ipcMain.handle('preview:hide', async () => {
        if (previewManager) {
            return previewManager.hide();
        }
        return { success: false, error: 'Preview manager not initialized' };
    });
    // App info
    ipcMain.handle('app:get-version', () => {
        return app.getVersion();
    });
    ipcMain.handle('app:get-path', (_, name) => {
        return app.getPath(name);
    });
    // Auto-updater
    ipcMain.handle('updater:check', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return { success: true, result };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('updater:download', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('updater:install', () => {
        autoUpdater.quitAndInstall();
    });
    // Shell utilities
    ipcMain.handle('shell:open-external', async (_, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    });
    // OAuth server for capturing redirects
    ipcMain.handle('oauth:start-server', async (_, requestedPort) => {
        return new Promise((resolve) => {
            const server = http.createServer((req, res) => {
                const reqUrl = new URL(`http://localhost${req.url}`);
                // Check if this is the callback with the token (from our JavaScript redirect)
                if (reqUrl.pathname === '/callback' && reqUrl.searchParams.has('access_token')) {
                    // This is the second request with the token extracted by JavaScript
                    const fullUrl = `http://localhost${req.url}`;
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Sign In Successful</title></head>
            <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fafafa;">
              <div style="text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">
                <div style="width: 56px; height: 56px; background: #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <h2 style="margin: 0 0 8px; font-size: 20px; color: #1a1a1a;">Sign In Successful</h2>
                <p style="margin: 0; color: #666; font-size: 14px;">You can close this window and return to the app.</p>
              </div>
            </body>
            </html>
          `);
                    // Send the OAuth callback URL with token to the renderer
                    mainWindow?.webContents.send('oauth:callback', fullUrl);
                    return;
                }
                // Initial OAuth redirect - extract fragment using JavaScript and redirect
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Processing Sign In...</title></head>
          <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fafafa;">
            <div style="text-align: center; padding: 40px;">
              <p style="margin: 0; color: #666; font-size: 14px;">Processing sign in...</p>
            </div>
            <script>
              // The access token is in the URL fragment (hash)
              // We need to extract it and send it to our server as query params
              const hash = window.location.hash.substring(1);
              if (hash) {
                // Redirect to /callback with the hash params as query params
                window.location.href = '/callback?' + hash;
              } else {
                document.body.innerHTML = '<div style="text-align: center; padding: 40px;"><p style="color: #dc2626;">Error: No authentication data received</p></div>';
              }
            </script>
          </body>
          </html>
        `);
            });
            const port = requestedPort || 0;
            server.listen(port, 'localhost', () => {
                const address = server.address();
                const actualPort = typeof address === 'object' && address ? address.port : port;
                oauthServers.set(actualPort, server);
                resolve({ success: true, port: actualPort });
            });
            server.on('error', (error) => {
                resolve({ success: false, error: String(error) });
            });
        });
    });
    ipcMain.handle('oauth:stop-server', async (_, port) => {
        const server = oauthServers.get(port);
        if (server) {
            server.close();
            oauthServers.delete(port);
            return { success: true };
        }
        return { success: false, error: 'Server not found' };
    });
}
// Set up auto-updater
function setupAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) => {
        mainWindow?.webContents.send('updater:update-available', info);
    });
    autoUpdater.on('update-downloaded', (info) => {
        mainWindow?.webContents.send('updater:update-downloaded', info);
    });
    autoUpdater.on('error', (error) => {
        mainWindow?.webContents.send('updater:error', error.message);
    });
    autoUpdater.on('download-progress', (progress) => {
        mainWindow?.webContents.send('updater:download-progress', progress);
    });
}
// App lifecycle
app.whenReady().then(async () => {
    setupCSPBypass();
    setupIPC();
    setupAutoUpdater();
    await createWindow();
    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('before-quit', () => {
    // Clean up server process
    if (serverManager) {
        serverManager.stop();
    }
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});
//# sourceMappingURL=main.js.map