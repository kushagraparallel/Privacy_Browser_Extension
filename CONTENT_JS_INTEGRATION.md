/**
 * CONTENT.JS INTEGRATION GUIDE
 * 
 * This file shows the EXACT changes needed to integrate agent-loop.js
 * into the existing content.js
 * 
 * Replace the entire content.js with this modified version
 */

/**
 * Privacy Browser Agent - Content Script (UPGRADED FOR AGENT LOOP)
 * 
 * Now supports:
 * - User query input from popup
 * - Groq-powered agentic loop
 * - Element registry and stability
 * - Privacy protection
 */

class PrivacyBrowserAgent {
    constructor() {
        // Keep existing components for backward compatibility
        this.visionProcessor = new VisionProcessor();
        this.privacyFilter = new PrivacyFilter();
        this.commandExecutor = new CommandExecutor();
        this.serverComm = null;
        this.config = null;

        // NEW: Agent components
        this.agentLoop = null;
        this.sessionManager = null;

        this.isActive = false;
        this.processingInterval = null;
        this.lastProcessingTime = 0;
        this.perf = new PerformanceMonitor();

        Logger.log('AGENT', 'Privacy Browser Agent content script initialized');
    }

    /**
     * Initialize the agent
     */
    async initialize() {
        try {
            Logger.log('AGENT', 'Initializing Privacy Browser Agent...');

            // Load configuration
            this.config = await Config.load();
            this.config.SERVER_URL = "http://localhost:8000";
            console.log('LOADED CONFIG:', JSON.stringify(this.config, null, 2));

            Logger.log('AGENT', 'Configuration loaded', this.config);

            // Initialize server communication (legacy)
            this.serverComm = new ServerComm(
                this.config.SERVER_URL || 'http://localhost:8000'
            );

            // Initialize vision processor
            const visionReady = await this.visionProcessor.initialize();
            if (!visionReady && this.config.ENABLE_LOCAL_VISION) {
                Logger.warn(
                    'AGENT',
                    'Vision processor initialization failed, continuing without local vision'
                );
            }

            // ========================================
            // NEW: Initialize agent loop components
            // ========================================
            this.initializeAgentComponents();

            // Set up message listeners
            this.setupMessageListeners();

            // Set up page mutation observer
            this.setupMutationObserver();

            // Notify background script
            chrome.runtime.sendMessage({
                type: 'content_ready',
                url: window.location.href
            }).catch((err) => {
                Logger.warn('AGENT', 'Failed to send ready message', err);
            });

            Logger.log('AGENT', 'Initialization complete');
            return true;

        } catch (error) {
            Logger.error('AGENT', 'Initialization failed', error);
            return false;
        }
    }

    /**
     * NEW: Initialize agent components (element registry, session manager, loop)
     */
    initializeAgentComponents() {
        // Create session manager with element registry
        this.sessionManager = new ClientSessionManager();
        this.sessionManager.serverUrl = this.config.SERVER_URL || 'http://localhost:8000';

        // Create agent loop orchestrator
        this.agentLoop = new AgentLoopOrchestrator(
            this.sessionManager,
            this.commandExecutor
        );

        // Make available globally for debugging
        window.sessionManager = this.sessionManager;
        window.agentLoop = this.agentLoop;

        Logger.log('AGENT', 'Agent components initialized (session manager, agent loop)');
    }

    /**
     * Set up message listeners (UPDATED to handle new message types)
     */
    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // ========================================
            // NEW: Handle agent session messages
            // ========================================
            if (request.type === 'start_agent_session') {
                this.handleStartAgentSession(request, sendResponse);
                return true; // Will respond async
            }

            if (request.type === 'stop_agent_session') {
                this.handleStopAgentSession(request, sendResponse);
                return true;
            }

            // ========================================
            // Keep existing message handlers
            // ========================================
            if (request.type === 'start_processing') {
                this.startProcessing();
                sendResponse({ success: true });
                return;
            }

            if (request.type === 'stop_processing') {
                this.stopProcessing();
                sendResponse({ success: true });
                return;
            }

            if (request.type === 'process_now') {
                this.processScreenCycle();
                sendResponse({ success: true });
                return;
            }

            if (request.type === 'get_status') {
                sendResponse({
                    success: true,
                    isActive: this.isActive,
                    sessionId: this.sessionManager?.sessionId || null
                });
                return;
            }

            if (request.type === 'update_config') {
                this.config = request.config;
                this.sessionManager.serverUrl = request.config.SERVER_URL || 'http://localhost:8000';
                sendResponse({ success: true });
                return;
            }
        });

        Logger.log('AGENT', 'Message listeners set up');
    }

    /**
     * NEW: Handle user initiating agent session from popup
     */
    async handleStartAgentSession(request, sendResponse) {
        try {
            const userGoal = request.goal;
            const serverUrl = request.serverUrl || this.config.SERVER_URL;

            Logger.log('AGENT', `Starting agent session with goal: ${userGoal}`);

            if (this.agentLoop.isRunning) {
                sendResponse({
                    success: false,
                    error: 'Agent is already running'
                });
                return;
            }

            // Start agent with user goal
            const success = await this.agentLoop.start(userGoal, serverUrl);

            if (!success) {
                sendResponse({
                    success: false,
                    error: 'Failed to start agent'
                });
                return;
            }

            sendResponse({
                success: true,
                session_id: this.agentLoop.currentSessionId
            });

            Logger.log('AGENT', `Agent session started: ${this.agentLoop.currentSessionId}`);

        } catch (error) {
            Logger.error('AGENT', 'Error starting agent session', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * NEW: Handle user stopping agent session
     */
    async handleStopAgentSession(request, sendResponse) {
        try {
            if (this.agentLoop && this.agentLoop.isRunning) {
                await this.agentLoop.stop();
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Agent not running' });
            }
        } catch (error) {
            Logger.error('AGENT', 'Error stopping agent session', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Start continuous screen processing (LEGACY - unchanged)
     */
    startProcessing() {
        if (this.isActive) {
            Logger.warn('AGENT', 'Processing already active');
            return;
        }

        if (!this.config) {
            Logger.error('AGENT', 'Cannot start processing: configuration is not loaded');
            return;
        }

        const processingInterval = this.config?.PERFORMANCE?.processingInterval || 5000;
        Logger.log('AGENT', `Starting continuous screen processing with interval: ${processingInterval}ms`);

        this.isActive = true;
        this.processingInterval = setInterval(() => {
            this.processScreenCycle();
        }, processingInterval);

        this.processScreenCycle();
    }

    /**
     * Stop continuous screen processing (LEGACY - unchanged)
     */
    stopProcessing() {
        if (!this.isActive) {
            return;
        }

        Logger.log('AGENT', 'Stopping screen processing');
        this.isActive = false;

        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
    }

    /**
     * Single screen processing cycle (LEGACY - unchanged)
     */
    async processScreenCycle() {
        if (!this.config) {
            Logger.error('AGENT', 'Cannot process screen: configuration is not loaded');
            return;
        }

        const processingInterval = this.config?.PERFORMANCE?.processingInterval || 5000;

        if (performance.now() - this.lastProcessingTime < processingInterval) {
            return;
        }

        this.lastProcessingTime = performance.now();

        try {
            await this.perf.measureAsync('CYCLE', async () => {
                Logger.log('AGENT', 'Processing screen...');

                const processResult = await this.visionProcessor.processScreen();

                if (!processResult) {
                    Logger.warn('AGENT', 'Screen processing returned null');
                    return;
                }

                if (this.config.SERVER_URL) {
                    try {
                        const sessionInfo = this.visionProcessor.getSessionInfo();

                        const serverResponse = await this.serverComm.sendRequest(
                            '/api/process-screen',
                            {
                                screenshot: processResult.screenshot,
                                pageStructure: processResult.pageStructure,
                                redactionMask: processResult.redactionMask,
                                sessionId: sessionInfo.sessionId
                            },
                            this.config.TIMEOUT.serverRequest
                        );

                        if (serverResponse && Array.isArray(serverResponse.commands) && serverResponse.commands.length > 0) {
                            Logger.log('AGENT', `Received ${serverResponse.commands.length} commands from server`);
                            await this.executeServerCommands(serverResponse.commands);
                        }

                        chrome.runtime.sendMessage({
                            type: 'processing_result',
                            data: {
                                success: true,
                                commandsExecuted: serverResponse && Array.isArray(serverResponse.commands)
                                    ? serverResponse.commands.length
                                    : 0,
                                redactionStats: processResult.redactionMask
                            }
                        }).catch((err) => {
                            Logger.warn('AGENT', 'Failed to send processing result', err);
                        });

                    } catch (error) {
                        Logger.error('AGENT', 'Server communication error', error);
                        chrome.runtime.sendMessage({
                            type: 'processing_error',
                            data: { error: error.message }
                        }).catch(() => {});
                    }
                }
            });
        } catch (error) {
            Logger.error('AGENT', 'Screen cycle error', error);
        }
    }

    /**
     * Execute server commands (LEGACY - unchanged)
     */
    async executeServerCommands(commands) {
        for (const cmd of commands) {
            try {
                await this.commandExecutor.execute(cmd);
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                Logger.error('AGENT', `Command execution failed: ${error.message}`);
            }
        }
    }

    /**
     * Set up page mutation observer (LEGACY - unchanged)
     */
    setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            Logger.debug('AGENT', `DOM mutation detected: ${mutations.length} changes`);
            
            // Invalidate element registry on major DOM changes
            if (this.sessionManager && this.sessionManager.elementRegistry) {
                this.sessionManager.elementRegistry.invalidateGeneration();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false
        });

        Logger.log('AGENT', 'Mutation observer set up');
    }
}

/**
 * Initialize and start the agent when content script loads
 */
let privacyAgent = null;

async function initializeContentScript() {
    Logger.log('CONTENT', 'Content script loading...');

    privacyAgent = new PrivacyBrowserAgent();
    const initialized = await privacyAgent.initialize();

    if (initialized) {
        Logger.log('CONTENT', 'Content script ready');
        // Don't auto-start processing - wait for user input from popup
    } else {
        Logger.error('CONTENT', 'Failed to initialize content script');
    }

    // Make agent available globally
    window.privacyAgent = privacyAgent;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
    // DOM already loaded
    initializeContentScript();
}

// Also initialize immediately for dynamic content scripts
if (!window.privacyAgent) {
    initializeContentScript();
}

Logger.log('CONTENT', 'Content script attached to page');
