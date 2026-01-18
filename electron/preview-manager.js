import { BrowserView } from 'electron';
// Inspector script to inject into the preview for element selection
const INSPECTOR_SCRIPT = `
(function() {
  if (window.__beadsInspector) return;

  window.__beadsInspector = {
    enabled: false,
    highlightEl: null,

    enable() {
      this.enabled = true;
      document.body.style.cursor = 'crosshair';

      // Create highlight overlay
      this.highlightEl = document.createElement('div');
      this.highlightEl.style.cssText = \`
        position: fixed;
        pointer-events: none;
        background: rgba(59, 130, 246, 0.2);
        border: 2px solid rgb(59, 130, 246);
        border-radius: 4px;
        z-index: 999999;
        display: none;
        transition: all 0.1s ease;
      \`;
      document.body.appendChild(this.highlightEl);

      document.addEventListener('click', this.handleClick, true);
      document.addEventListener('mouseover', this.handleHover, true);
      document.addEventListener('mouseout', this.handleMouseOut, true);
      document.addEventListener('keydown', this.handleKeyDown, true);
    },

    disable() {
      this.enabled = false;
      document.body.style.cursor = '';

      if (this.highlightEl) {
        this.highlightEl.remove();
        this.highlightEl = null;
      }

      document.removeEventListener('click', this.handleClick, true);
      document.removeEventListener('mouseover', this.handleHover, true);
      document.removeEventListener('mouseout', this.handleMouseOut, true);
      document.removeEventListener('keydown', this.handleKeyDown, true);
    },

    handleClick(e) {
      if (!window.__beadsInspector.enabled) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const selector = window.__beadsInspector.getSelector(e.target);
      const computedStyle = window.getComputedStyle(e.target);
      const rect = e.target.getBoundingClientRect();

      // Send element info via postMessage
      window.postMessage({
        type: 'beads:element-selected',
        data: {
          selector,
          tagName: e.target.tagName.toLowerCase(),
          id: e.target.id || null,
          className: e.target.className || null,
          text: e.target.textContent?.slice(0, 100) || null,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          styles: {
            color: computedStyle.color,
            backgroundColor: computedStyle.backgroundColor,
            fontSize: computedStyle.fontSize,
            fontFamily: computedStyle.fontFamily,
            padding: computedStyle.padding,
            margin: computedStyle.margin
          }
        }
      }, '*');

      window.__beadsInspector.disable();
      return false;
    },

    handleHover(e) {
      if (!window.__beadsInspector.enabled || !window.__beadsInspector.highlightEl) return;

      const rect = e.target.getBoundingClientRect();
      const highlightEl = window.__beadsInspector.highlightEl;

      highlightEl.style.display = 'block';
      highlightEl.style.left = rect.left + 'px';
      highlightEl.style.top = rect.top + 'px';
      highlightEl.style.width = rect.width + 'px';
      highlightEl.style.height = rect.height + 'px';
    },

    handleMouseOut() {
      if (!window.__beadsInspector.enabled || !window.__beadsInspector.highlightEl) return;
      window.__beadsInspector.highlightEl.style.display = 'none';
    },

    handleKeyDown(e) {
      // ESC to cancel inspection
      if (e.key === 'Escape') {
        window.__beadsInspector.disable();
        window.postMessage({ type: 'beads:inspector-cancelled' }, '*');
      }
    },

    getSelector(el) {
      // Try ID first
      if (el.id) {
        return '#' + CSS.escape(el.id);
      }

      // Try unique class combination
      if (el.classList.length > 0) {
        const classes = Array.from(el.classList)
          .filter(c => !c.startsWith('_') && !/^[a-z0-9]{5,}$/i.test(c)) // Filter out likely generated classes
          .slice(0, 3);
        if (classes.length > 0) {
          const selector = el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
          if (document.querySelectorAll(selector).length === 1) {
            return selector;
          }
        }
      }

      // Build path from root
      const path = [];
      let current = el;
      while (current && current !== document.body && path.length < 5) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
          selector = '#' + CSS.escape(current.id);
          path.unshift(selector);
          break;
        }

        // Add nth-child if needed for uniqueness
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += ':nth-child(' + index + ')';
          }
        }

        path.unshift(selector);
        current = parent;
      }

      return path.join(' > ');
    }
  };

  // Bind handlers properly
  window.__beadsInspector.handleClick = window.__beadsInspector.handleClick.bind(window.__beadsInspector);
  window.__beadsInspector.handleHover = window.__beadsInspector.handleHover.bind(window.__beadsInspector);
  window.__beadsInspector.handleMouseOut = window.__beadsInspector.handleMouseOut.bind(window.__beadsInspector);
  window.__beadsInspector.handleKeyDown = window.__beadsInspector.handleKeyDown.bind(window.__beadsInspector);
})();
`;
export class PreviewManager {
    mainWindow;
    previewView = null;
    currentUrl = null;
    previewUrls = new Set();
    isVisible = false;
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
    }
    /**
     * Check if a URL is a preview URL (for CSP bypass)
     */
    isPreviewUrl(url) {
        if (!url)
            return false;
        try {
            const parsedUrl = new URL(url);
            const host = parsedUrl.hostname;
            // Check if it's in our tracked preview URLs
            for (const previewUrl of this.previewUrls) {
                try {
                    const previewParsed = new URL(previewUrl);
                    if (parsedUrl.hostname === previewParsed.hostname) {
                        return true;
                    }
                }
                catch {
                    // Invalid URL, skip
                }
            }
            // Also check for common development server patterns
            const devPatterns = [
                /localhost:\d+/,
                /127\.0\.0\.1:\d+/,
                /192\.168\.\d+\.\d+:\d+/,
                /\.local:\d+/,
                /\.shopify\.com/,
                /\.myshopify\.com/
            ];
            return devPatterns.some(pattern => pattern.test(host + (parsedUrl.port ? ':' + parsedUrl.port : '')));
        }
        catch {
            return false;
        }
    }
    /**
     * Load a URL in the preview view
     */
    loadUrl(url) {
        try {
            if (!url) {
                return { success: false, error: 'URL is required' };
            }
            // Track this URL for CSP bypass
            this.previewUrls.add(url);
            this.currentUrl = url;
            // Create preview view if it doesn't exist
            if (!this.previewView) {
                this.previewView = new BrowserView({
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        sandbox: true
                    }
                });
                // Set up navigation listeners
                this.setupNavigationListeners();
            }
            // Load the URL
            this.previewView.webContents.loadURL(url);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Set up navigation event listeners for URL tracking
     */
    setupNavigationListeners() {
        if (!this.previewView)
            return;
        // Track full page navigation
        this.previewView.webContents.on('did-navigate', (_, url) => {
            this.currentUrl = url;
            this.mainWindow.webContents.send('preview:url-changed', url);
        });
        // Track SPA navigation (in-page navigation)
        this.previewView.webContents.on('did-navigate-in-page', (_, url) => {
            this.currentUrl = url;
            this.mainWindow.webContents.send('preview:url-changed', url);
        });
        // Track page title changes
        this.previewView.webContents.on('page-title-updated', (_, title) => {
            this.mainWindow.webContents.send('preview:title-changed', title);
        });
        // Forward console messages from preview to main window
        this.previewView.webContents.on('console-message', (_, level, message, line, sourceId) => {
            // Check for inspector messages sent via console.log
            if (message.startsWith('__BEADS_MESSAGE__')) {
                try {
                    const data = JSON.parse(message.replace('__BEADS_MESSAGE__', ''));
                    if (data.type === 'beads:element-selected') {
                        this.mainWindow.webContents.send('preview:element-selected', data.data);
                    }
                    else if (data.type === 'beads:inspector-cancelled') {
                        this.mainWindow.webContents.send('preview:inspector-cancelled');
                    }
                }
                catch (e) {
                    console.error('Failed to parse inspector message:', e);
                }
                return; // Don't forward internal messages
            }
            this.mainWindow.webContents.send('preview:console-message', {
                level,
                message,
                line,
                sourceId
            });
        });
        // Handle messages from the inspector script
        this.previewView.webContents.on('ipc-message', (_, channel, ...args) => {
            if (channel === 'beads-inspector') {
                this.mainWindow.webContents.send('preview:element-selected', args[0]);
            }
        });
        // Listen for postMessage from the preview (for inspector)
        this.previewView.webContents.on('dom-ready', () => {
            // Inject a message listener to capture postMessage events
            this.previewView?.webContents.executeJavaScript(`
        window.addEventListener('message', (e) => {
          if (e.data && e.data.type && e.data.type.startsWith('beads:')) {
            // Use a custom event that we can catch
            window.dispatchEvent(new CustomEvent('beads-message', { detail: e.data }));
          }
        });
      `);
        });
    }
    /**
     * Refresh the preview
     */
    refresh() {
        if (!this.previewView) {
            return { success: false, error: 'No preview loaded' };
        }
        try {
            this.previewView.webContents.reload();
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Open DevTools for the preview
     */
    openDevTools() {
        if (!this.previewView) {
            return { success: false, error: 'No preview loaded' };
        }
        try {
            this.previewView.webContents.openDevTools({ mode: 'detach' });
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Close DevTools for the preview
     */
    closeDevTools() {
        if (!this.previewView) {
            return { success: false, error: 'No preview loaded' };
        }
        try {
            this.previewView.webContents.closeDevTools();
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Enable element inspector mode
     */
    enableInspector() {
        if (!this.previewView) {
            return { success: false, error: 'No preview loaded' };
        }
        try {
            this.previewView.webContents.executeJavaScript(INSPECTOR_SCRIPT + '\nwindow.__beadsInspector.enable();');
            // Set up message forwarding for element selection
            this.previewView.webContents.executeJavaScript(`
        if (!window.__beadsMessageHandler) {
          window.__beadsMessageHandler = (e) => {
            if (e.detail && e.detail.type) {
              // Forward to main process via exposed API or console
              console.log('__BEADS_MESSAGE__' + JSON.stringify(e.detail));
            }
          };
          window.addEventListener('beads-message', window.__beadsMessageHandler);
        }
      `);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Disable element inspector mode
     */
    disableInspector() {
        if (!this.previewView) {
            return { success: false, error: 'No preview loaded' };
        }
        try {
            this.previewView.webContents.executeJavaScript('window.__beadsInspector?.disable();');
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Set the bounds of the preview view
     */
    setBounds(bounds) {
        if (!this.previewView) {
            return { success: false, error: 'No preview loaded' };
        }
        try {
            // Add the preview view to the window if not already added
            if (!this.isVisible) {
                this.mainWindow.addBrowserView(this.previewView);
                this.isVisible = true;
            }
            this.previewView.setBounds(bounds);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Show the preview view
     */
    show() {
        if (!this.previewView) {
            return { success: false, error: 'No preview loaded' };
        }
        try {
            if (!this.isVisible) {
                this.mainWindow.addBrowserView(this.previewView);
                this.isVisible = true;
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Hide the preview view
     */
    hide() {
        if (!this.previewView) {
            return { success: false, error: 'No preview loaded' };
        }
        try {
            if (this.isVisible) {
                this.mainWindow.removeBrowserView(this.previewView);
                this.isVisible = false;
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Get the current URL
     */
    getCurrentUrl() {
        return this.currentUrl;
    }
    /**
     * Destroy the preview view
     */
    destroy() {
        if (this.previewView) {
            if (this.isVisible) {
                this.mainWindow.removeBrowserView(this.previewView);
            }
            // BrowserView doesn't have a destroy method in newer Electron versions
            // Just remove the reference
            this.previewView = null;
            this.isVisible = false;
        }
        this.currentUrl = null;
        this.previewUrls.clear();
    }
}
//# sourceMappingURL=preview-manager.js.map