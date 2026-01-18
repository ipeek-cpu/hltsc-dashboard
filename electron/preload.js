"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('[Electron Preload] Loading preload script...');
// Expose Electron APIs to the renderer process
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Preview controls
    loadPreview: (url) => electron_1.ipcRenderer.invoke('preview:load', url),
    refreshPreview: () => electron_1.ipcRenderer.invoke('preview:refresh'),
    openDevTools: () => electron_1.ipcRenderer.invoke('preview:open-devtools'),
    closeDevTools: () => electron_1.ipcRenderer.invoke('preview:close-devtools'),
    enableInspector: () => electron_1.ipcRenderer.invoke('preview:enable-inspector'),
    disableInspector: () => electron_1.ipcRenderer.invoke('preview:disable-inspector'),
    setPreviewBounds: (bounds) => electron_1.ipcRenderer.invoke('preview:set-bounds', bounds),
    showPreview: () => electron_1.ipcRenderer.invoke('preview:show'),
    hidePreview: () => electron_1.ipcRenderer.invoke('preview:hide'),
    // Event listeners for preview
    onUrlChanged: (callback) => {
        const handler = (_, url) => callback(url);
        electron_1.ipcRenderer.on('preview:url-changed', handler);
        return () => electron_1.ipcRenderer.removeListener('preview:url-changed', handler);
    },
    onTitleChanged: (callback) => {
        const handler = (_, title) => callback(title);
        electron_1.ipcRenderer.on('preview:title-changed', handler);
        return () => electron_1.ipcRenderer.removeListener('preview:title-changed', handler);
    },
    onElementSelected: (callback) => {
        const handler = (_, data) => callback(data);
        electron_1.ipcRenderer.on('preview:element-selected', handler);
        return () => electron_1.ipcRenderer.removeListener('preview:element-selected', handler);
    },
    onInspectorCancelled: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('preview:inspector-cancelled', handler);
        return () => electron_1.ipcRenderer.removeListener('preview:inspector-cancelled', handler);
    },
    onConsoleMessage: (callback) => {
        const handler = (_, data) => callback(data);
        electron_1.ipcRenderer.on('preview:console-message', handler);
        return () => electron_1.ipcRenderer.removeListener('preview:console-message', handler);
    },
    // App info
    getVersion: () => electron_1.ipcRenderer.invoke('app:get-version'),
    getPath: (name) => electron_1.ipcRenderer.invoke('app:get-path', name),
    // Auto-updater
    checkForUpdates: () => electron_1.ipcRenderer.invoke('updater:check'),
    downloadUpdate: () => electron_1.ipcRenderer.invoke('updater:download'),
    installUpdate: () => electron_1.ipcRenderer.invoke('updater:install'),
    // Updater event listeners
    onUpdateAvailable: (callback) => {
        const handler = (_, info) => callback(info);
        electron_1.ipcRenderer.on('updater:update-available', handler);
        return () => electron_1.ipcRenderer.removeListener('updater:update-available', handler);
    },
    onUpdateDownloaded: (callback) => {
        const handler = (_, info) => callback(info);
        electron_1.ipcRenderer.on('updater:update-downloaded', handler);
        return () => electron_1.ipcRenderer.removeListener('updater:update-downloaded', handler);
    },
    onUpdateError: (callback) => {
        const handler = (_, error) => callback(error);
        electron_1.ipcRenderer.on('updater:error', handler);
        return () => electron_1.ipcRenderer.removeListener('updater:error', handler);
    },
    onDownloadProgress: (callback) => {
        const handler = (_, progress) => callback(progress);
        electron_1.ipcRenderer.on('updater:download-progress', handler);
        return () => electron_1.ipcRenderer.removeListener('updater:download-progress', handler);
    },
    // Platform info
    platform: process.platform,
    isElectron: true,
    // Shell utilities
    openExternal: (url) => electron_1.ipcRenderer.invoke('shell:open-external', url),
    // OAuth support
    startOAuthServer: (port) => electron_1.ipcRenderer.invoke('oauth:start-server', port),
    stopOAuthServer: (port) => electron_1.ipcRenderer.invoke('oauth:stop-server', port),
    onOAuthCallback: (callback) => {
        const handler = (_, url) => callback(url);
        electron_1.ipcRenderer.on('oauth:callback', handler);
        return () => electron_1.ipcRenderer.removeListener('oauth:callback', handler);
    }
});
console.log('[Electron Preload] electronAPI exposed successfully');
//# sourceMappingURL=preload.js.map