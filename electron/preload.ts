import { contextBridge, ipcRenderer } from 'electron';

console.log('[Electron Preload] Loading preload script...');

// Expose Electron APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Preview controls
  loadPreview: (url: string) => ipcRenderer.invoke('preview:load', url),
  refreshPreview: () => ipcRenderer.invoke('preview:refresh'),
  openDevTools: () => ipcRenderer.invoke('preview:open-devtools'),
  closeDevTools: () => ipcRenderer.invoke('preview:close-devtools'),
  enableInspector: () => ipcRenderer.invoke('preview:enable-inspector'),
  disableInspector: () => ipcRenderer.invoke('preview:disable-inspector'),
  setPreviewBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('preview:set-bounds', bounds),
  showPreview: () => ipcRenderer.invoke('preview:show'),
  hidePreview: () => ipcRenderer.invoke('preview:hide'),

  // Event listeners for preview
  onUrlChanged: (callback: (url: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('preview:url-changed', handler);
    return () => ipcRenderer.removeListener('preview:url-changed', handler);
  },
  onTitleChanged: (callback: (title: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, title: string) => callback(title);
    ipcRenderer.on('preview:title-changed', handler);
    return () => ipcRenderer.removeListener('preview:title-changed', handler);
  },
  onElementSelected: (callback: (data: ElementSelectionData) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ElementSelectionData) => callback(data);
    ipcRenderer.on('preview:element-selected', handler);
    return () => ipcRenderer.removeListener('preview:element-selected', handler);
  },
  onInspectorCancelled: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('preview:inspector-cancelled', handler);
    return () => ipcRenderer.removeListener('preview:inspector-cancelled', handler);
  },
  onConsoleMessage: (callback: (data: ConsoleMessageData) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ConsoleMessageData) => callback(data);
    ipcRenderer.on('preview:console-message', handler);
    return () => ipcRenderer.removeListener('preview:console-message', handler);
  },

  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPath: (name: string) => ipcRenderer.invoke('app:get-path', name),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),

  // Updater event listeners
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('updater:update-available', handler);
    return () => ipcRenderer.removeListener('updater:update-available', handler);
  },
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('updater:update-downloaded', handler);
    return () => ipcRenderer.removeListener('updater:update-downloaded', handler);
  },
  onUpdateError: (callback: (error: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('updater:error', handler);
    return () => ipcRenderer.removeListener('updater:error', handler);
  },
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: DownloadProgress) => callback(progress);
    ipcRenderer.on('updater:download-progress', handler);
    return () => ipcRenderer.removeListener('updater:download-progress', handler);
  },

  // Platform info
  platform: process.platform,
  isElectron: true,

  // Shell utilities
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // OAuth support
  startOAuthServer: (port?: number) => ipcRenderer.invoke('oauth:start-server', port),
  stopOAuthServer: (port: number) => ipcRenderer.invoke('oauth:stop-server', port),
  onOAuthCallback: (callback: (url: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('oauth:callback', handler);
    return () => ipcRenderer.removeListener('oauth:callback', handler);
  }
});

// Type definitions for the exposed API
interface ElementSelectionData {
  selector: string;
  tagName: string;
  id: string | null;
  className: string | null;
  text: string | null;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  styles: {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontFamily: string;
    padding: string;
    margin: string;
  };
}

interface ConsoleMessageData {
  level: number;
  message: string;
  line: number;
  sourceId: string;
}

interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

interface DownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

console.log('[Electron Preload] electronAPI exposed successfully');

// Augment the Window interface
declare global {
  interface Window {
    electronAPI: {
      // Preview controls
      loadPreview: (url: string) => Promise<{ success: boolean; error?: string }>;
      refreshPreview: () => Promise<{ success: boolean; error?: string }>;
      openDevTools: () => Promise<{ success: boolean; error?: string }>;
      closeDevTools: () => Promise<{ success: boolean; error?: string }>;
      enableInspector: () => Promise<{ success: boolean; error?: string }>;
      disableInspector: () => Promise<{ success: boolean; error?: string }>;
      setPreviewBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<{ success: boolean; error?: string }>;
      showPreview: () => Promise<{ success: boolean; error?: string }>;
      hidePreview: () => Promise<{ success: boolean; error?: string }>;

      // Event listeners
      onUrlChanged: (callback: (url: string) => void) => () => void;
      onTitleChanged: (callback: (title: string) => void) => () => void;
      onElementSelected: (callback: (data: ElementSelectionData) => void) => () => void;
      onInspectorCancelled: (callback: () => void) => () => void;
      onConsoleMessage: (callback: (data: ConsoleMessageData) => void) => () => void;

      // App info
      getVersion: () => Promise<string>;
      getPath: (name: string) => Promise<string>;

      // Auto-updater
      checkForUpdates: () => Promise<{ success: boolean; result?: unknown; error?: string }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      installUpdate: () => void;

      // Updater event listeners
      onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
      onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
      onUpdateError: (callback: (error: string) => void) => () => void;
      onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;

      // Platform info
      platform: string;
      isElectron: boolean;

      // Shell utilities
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;

      // OAuth support
      startOAuthServer: (port?: number) => Promise<{ success: boolean; port?: number; error?: string }>;
      stopOAuthServer: (port: number) => Promise<{ success: boolean; error?: string }>;
      onOAuthCallback: (callback: (url: string) => void) => () => void;
    };
  }
}
