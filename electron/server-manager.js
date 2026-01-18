import { app } from 'electron';
import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import * as os from 'os';
export class ServerManager {
    serverProcess = null;
    _port = 5555;
    isRunning = false;
    get port() {
        return this._port;
    }
    /**
     * Get the path to the bundled Node.js binary
     */
    getBundledNodePath() {
        if (app.isPackaged) {
            // In production, node is in the app's Resources/bin directory
            const resourcesPath = process.resourcesPath;
            return path.join(resourcesPath, 'bin', 'node');
        }
        else {
            // In development, use system node or bundled node in src-tauri/bin
            const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
            const bundledNode = path.join(app.getAppPath(), 'src-tauri', 'bin', `node-${arch}-apple-darwin`);
            // Check if bundled node exists
            try {
                require('fs').accessSync(bundledNode);
                return bundledNode;
            }
            catch {
                // Fall back to system node
                return 'node';
            }
        }
    }
    /**
     * Get the path to the SvelteKit server entry point
     */
    getServerPath() {
        if (app.isPackaged) {
            // In production, server is in Resources/server
            const resourcesPath = process.resourcesPath;
            return path.join(resourcesPath, 'server', 'index.js');
        }
        else {
            // In development, use the build output
            return path.join(app.getAppPath(), 'build', 'index.js');
        }
    }
    /**
     * Get the path to the managed Claude CLI
     */
    getManagedClaudePath() {
        const homeDir = os.homedir();
        return path.join(homeDir, '.beads-dashboard', 'bin', 'claude');
    }
    /**
     * Check if a port is available
     */
    isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => {
                resolve(false);
            });
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            server.listen(port, '127.0.0.1');
        });
    }
    /**
     * Kill any process using the specified port
     */
    killProcessOnPort(port) {
        try {
            // Use lsof to find processes on the port (macOS/Linux)
            const output = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' });
            const pids = output.trim().split('\n').filter(Boolean);
            for (const pid of pids) {
                console.log(`Killing process on port ${port}: PID ${pid}`);
                try {
                    execSync(`kill -9 ${pid}`);
                }
                catch (e) {
                    console.error(`Failed to kill PID ${pid}:`, e);
                }
            }
        }
        catch {
            // No process found on port, which is fine
        }
    }
    /**
     * Start the SvelteKit server
     */
    async start() {
        if (this.isRunning) {
            console.log('Server is already running');
            return;
        }
        const nodePath = this.getBundledNodePath();
        const serverPath = this.getServerPath();
        const claudePath = this.getManagedClaudePath();
        console.log('Starting server with:');
        console.log('  Node path:', nodePath);
        console.log('  Server path:', serverPath);
        console.log('  Claude path:', claudePath);
        // Check if port is available
        const portAvailable = await this.isPortAvailable(this._port);
        if (!portAvailable) {
            console.log(`Port ${this._port} is in use, killing existing process...`);
            this.killProcessOnPort(this._port);
            // Wait for port to be released
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        // Spawn the server process
        this.serverProcess = spawn(nodePath, [serverPath], {
            env: {
                ...process.env,
                PORT: String(this._port),
                HOST: '127.0.0.1',
                MANAGED_CLAUDE_PATH: claudePath,
                NODE_ENV: app.isPackaged ? 'production' : 'development'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        this.isRunning = true;
        // Log server output
        this.serverProcess.stdout?.on('data', (data) => {
            console.log('[Server]', data.toString().trim());
        });
        this.serverProcess.stderr?.on('data', (data) => {
            console.error('[Server Error]', data.toString().trim());
        });
        this.serverProcess.on('exit', (code, signal) => {
            console.log(`Server exited with code ${code}, signal ${signal}`);
            this.isRunning = false;
            this.serverProcess = null;
        });
        this.serverProcess.on('error', (error) => {
            console.error('Server process error:', error);
            this.isRunning = false;
        });
        // Wait for server to be ready by polling the health endpoint
        await this.waitForServer();
    }
    /**
     * Wait for the server to be ready
     */
    async waitForServer(maxAttempts = 30, interval = 500) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = await fetch(`http://127.0.0.1:${this._port}/api/health`);
                if (response.ok) {
                    console.log('Server is ready');
                    return;
                }
            }
            catch {
                // Server not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        console.warn('Server did not become ready in time, proceeding anyway');
    }
    /**
     * Stop the server
     */
    stop() {
        if (this.serverProcess) {
            console.log('Stopping server...');
            this.serverProcess.kill();
            this.serverProcess = null;
        }
        // Also kill any process on the port as a fallback
        this.killProcessOnPort(this._port);
        this.isRunning = false;
        console.log('Server stopped');
    }
    /**
     * Restart the server
     */
    async restart() {
        this.stop();
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.start();
    }
}
//# sourceMappingURL=server-manager.js.map