/**
 * Popup UI Controller for Privacy Browser Agent
 */

class PopupController {
    constructor() {
        this.config = null;
        this.statusUpdateInterval = null;
        this.logs = [];
        this.maxLogs = 50;

        this.initializeUI();
        this.loadConfiguration();
        this.setupEventListeners();
        this.startStatusUpdates();
    }

    initializeUI() {
        // Initialize UI elements
        this.elements = {
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            processBtn: document.getElementById('processBtn'),
            saveConfig: document.getElementById('saveConfig'),
            clearLogs: document.getElementById('clearLogs'),
            
            statusLabel: document.getElementById('statusLabel'),
            sessionId: document.getElementById('sessionId'),
            serverStatus: document.getElementById('serverStatus'),
            
            sensitiveCount: document.getElementById('sensitiveCount'),
            redactedCount: document.getElementById('redactedCount'),
            processingTime: document.getElementById('processingTime'),
            
            serverUrl: document.getElementById('serverUrl'),
            enableRedaction: document.getElementById('enableRedaction'),
            redactionMode: document.getElementById('redactionMode'),
            
            logContainer: document.getElementById('logContainer'),
            settingsLink: document.getElementById('settingsLink'),
            helpLink: document.getElementById('helpLink')
        };
    }

    setupEventListeners() {
        this.elements.startBtn.addEventListener('click', () => this.startMonitoring());
        this.elements.stopBtn.addEventListener('click', () => this.stopMonitoring());
        this.elements.processBtn.addEventListener('click', () => this.processNow());
        this.elements.saveConfig.addEventListener('click', () => this.saveConfiguration());
        this.elements.clearLogs.addEventListener('click', () => this.clearLogs());
        
        this.elements.settingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.openSettings();
        });

        this.elements.helpLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.openHelp();
        });
    }

    async loadConfiguration() {
        try {
            const config = await this.sendMessage({
                type: 'get_status'
            });

            if (config.success) {
                this.updateStatusUI(config);
                this.addLog('Configuration loaded', 'info');
            }

            // Load from storage
            chrome.storage.sync.get({
                SERVER_URL: 'http://localhost:8000',
                ENABLE_REDACTION: true,
                REDACTION_MODE: 'blur'
            }, (items) => {
                this.elements.serverUrl.value = items.SERVER_URL;
                this.elements.enableRedaction.checked = items.ENABLE_REDACTION;
                this.elements.redactionMode.value = items.REDACTION_MODE;
                this.config = items;
            });
        } catch (error) {
            this.addLog(`Failed to load config: ${error.message}`, 'error');
        }
    }

    async startMonitoring() {
        try {
            await this.sendToContent({ type: 'start_processing' });
            this.elements.startBtn.disabled = true;
            this.elements.stopBtn.disabled = false;
            this.elements.statusLabel.textContent = 'Active';
            this.elements.statusLabel.className = 'status-active';
            this.addLog('Monitoring started', 'success');
        } catch (error) {
            this.addLog(`Failed to start: ${error.message}`, 'error');
        }
    }

    async stopMonitoring() {
        try {
            await this.sendToContent({ type: 'stop_processing' });
            this.elements.startBtn.disabled = false;
            this.elements.stopBtn.disabled = true;
            this.elements.statusLabel.textContent = 'Inactive';
            this.elements.statusLabel.className = 'status-inactive';
            this.addLog('Monitoring stopped', 'warning');
        } catch (error) {
            this.addLog(`Failed to stop: ${error.message}`, 'error');
        }
    }

    async processNow() {
        try {
            this.elements.processBtn.disabled = true;
            this.addLog('Processing screen...', 'info');
            
            const result = await this.sendToContent({ type: 'process_now' });
            this.addLog('Screen processed successfully', 'success');
            
            this.elements.processBtn.disabled = false;
        } catch (error) {
            this.addLog(`Processing failed: ${error.message}`, 'error');
            this.elements.processBtn.disabled = false;
        }
    }

    saveConfiguration() {
        const config = {
            SERVER_URL: this.elements.serverUrl.value,
            ENABLE_REDACTION: this.elements.enableRedaction.checked,
            REDACTION_MODE: this.elements.redactionMode.value
        };

        chrome.storage.sync.set(config, () => {
            this.addLog('Settings saved', 'success');
            this.sendToContent({
                type: 'update_config',
                config: config
            }).catch(err => {
                this.addLog(`Failed to update content script: ${err.message}`, 'error');
            });
        });
    }

    async startStatusUpdates() {
        this.statusUpdateInterval = setInterval(async () => {
            try {
                const status = await this.sendToContent({ type: 'get_status' });
                if (status.success) {
                    this.updateStatusUI(status);
                }
            } catch (error) {
                // Silently handle errors during updates
            }
        }, 1000);
    }

    updateStatusUI(status) {
        if (status.isActive) {
            this.elements.statusLabel.textContent = 'Active';
            this.elements.statusLabel.className = 'status-active';
            this.elements.startBtn.disabled = true;
            this.elements.stopBtn.disabled = false;
        } else {
            this.elements.statusLabel.textContent = 'Inactive';
            this.elements.statusLabel.className = 'status-inactive';
            this.elements.startBtn.disabled = false;
            this.elements.stopBtn.disabled = true;
        }

        if (status.sessionId) {
            this.elements.sessionId.textContent = status.sessionId;
        }

        if (status.privacyStats) {
            this.elements.sensitiveCount.textContent = status.privacyStats.sensitiveDetected || 0;
            this.elements.redactedCount.textContent = status.privacyStats.redacted || 0;
        }
    }

    addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            message,
            type,
            timestamp
        };

        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.renderLogs();
    }

    renderLogs() {
        this.elements.logContainer.innerHTML = this.logs
            .map(log => `<div class="log-entry log-${log.type}">[${log.timestamp}] ${log.message}</div>`)
            .join('');
        
        // Scroll to bottom
        this.elements.logContainer.scrollTop = this.elements.logContainer.scrollHeight;
    }

    clearLogs() {
        this.logs = [];
        this.renderLogs();
        this.addLog('Logs cleared', 'info');
    }

    async sendToContent(message) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) {
                    reject(new Error('No active tab'));
                    return;
                }

                chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response?.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve(response || {});
                    }
                });
            });
        });
    }

    async sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response || {});
                }
            });
        });
    }

    openSettings() {
        chrome.runtime.openOptionsPage?.(() => {
            this.addLog('Opening settings page', 'info');
        });
    }

    openHelp() {
        // Open help documentation
        chrome.tabs.create({
            url: 'https://github.com/your-repo/docs'
        });
    }
}

// Initialize popup controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.popupController = new PopupController();
});