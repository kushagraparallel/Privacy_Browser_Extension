/**
 * Privacy Browser Agent - Content Script
 * Main orchestration of client-side vision processing and privacy protection
 */

class PrivacyBrowserAgent {
    constructor() {
        this.visionProcessor = new VisionProcessor();
        this.privacyFilter = new PrivacyFilter();
        this.commandExecutor = new CommandExecutor();
        this.serverComm = null;
        this.config = null;
        
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
            Logger.log('AGENT', 'Configuration loaded', this.config);

            // Initialize server communication
            this.serverComm = new ServerComm(this.config.SERVER_URL);

            // Initialize vision processor
            const visionReady = await this.visionProcessor.initialize();
            if (!visionReady && this.config.ENABLE_LOCAL_VISION) {
                Logger.warn('AGENT', 'Vision processor initialization failed, continuing without local vision');
            }

            // Set up message listeners
            this.setupMessageListeners();

            // Set up page mutation observer
            this.setupMutationObserver();

            // Notify background script that content script is ready
            chrome.runtime.sendMessage({
                type: 'content_ready',
                url: window.location.href
            }).catch(err => Logger.warn('AGENT', 'Failed to send ready message', err));

            Logger.log('AGENT', 'Initialization complete');
            return true;
        } catch (error) {
            Logger.error('AGENT', 'Initialization failed', error);
            return false;
        }
    }

    /**
     * Start continuous screen processing
     */
    startProcessing() {
        if (this.isActive) {
            Logger.warn('AGENT', 'Processing already active');
            return;
        }

        Logger.log('AGENT', 'Starting continuous screen processing');
        this.isActive = true;

        this.processingInterval = setInterval(() => {
            this.processScreenCycle();
        }, this.config.PERFORMANCE.processingInterval);

        // Also process immediately
        this.processScreenCycle();
    }

    /**
     * Stop continuous screen processing
     */
    stopProcessing() {
        if (!this.isActive) return;

        Logger.log('AGENT', 'Stopping screen processing');
        this.isActive = false;

        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
    }

    /**
     * Single screen processing cycle
     */
    async processScreenCycle() {
        // Prevent concurrent processing
        if (performance.now() - this.lastProcessingTime < this.config.PERFORMANCE.processingInterval) {
            return;
        }

        this.lastProcessingTime = performance.now();

        try {
            await this.perf.measureAsync('CYCLE', async () => {
                // Step 1: Capture and process screen
                const processResult = await this.visionProcessor.processScreen();

                if (!processResult) {
                    Logger.warn('AGENT', 'Screen processing returned null');
                    return;
                }

                // Step 2: Send to server if configured
                if (this.config.SERVER_URL) {
                    try {
                        const serverResponse = await this.serverComm.sendRequest('/api/process-screen', {
                            screenshot: processResult.screenshot,
                            pageStructure: processResult.pageStructure,
                            redactionMask: processResult.redactionMask,
                            sessionId: this.visionProcessor.getSessionInfo().sessionId
                        }, this.config.TIMEOUT.serverRequest);

                        // Step 3: Execute any commands from server
                        if (serverResponse.commands && serverResponse.commands.length > 0) {
                            Logger.log('AGENT', `Received ${serverResponse.commands.length} commands from server`);
                            await this.executeServerCommands(serverResponse.commands);
                        }

                        // Send response back to popup/background
                        chrome.runtime.sendMessage({
                            type: 'processing_result',
                            data: {
                                success: true,
                                commandsExecuted: serverResponse.commands?.length || 0,
                                redactionStats: processResult.redactionMask.stats
                            }
                        }).catch(err => Logger.warn('AGENT', 'Failed to send result message', err));

                    } catch (serverError) {
                        Logger.error('AGENT', 'Server communication error', serverError);
                    }
                }
            });
        } catch (error) {
            Logger.error('AGENT', 'Processing cycle error', error);
        }
    }

    /**
     * Execute commands from server
     */
    async executeServerCommands(commands) {
        for (const command of commands) {
            try {
                const result = await this.commandExecutor.execute(command);
                Logger.log('AGENT', `Command executed: ${command.type}`, result);

                // Small delay between commands
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                Logger.error('AGENT', `Failed to execute command: ${command.type}`, error);
            }
        }
    }

    /**
     * Set up message listeners for communication
     */
    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            try {
                switch (request.type) {
                    case 'start_processing':
                        this.startProcessing();
                        sendResponse({ success: true, message: 'Processing started' });
                        break;

                    case 'stop_processing':
                        this.stopProcessing();
                        sendResponse({ success: true, message: 'Processing stopped' });
                        break;

                    case 'process_now':
                        this.processScreenCycle().then(() => {
                            sendResponse({ success: true, message: 'Processing cycle completed' });
                        });
                        return true; // Will respond asynchronously

                    case 'execute_command':
                        this.commandExecutor.execute(request.command).then((result) => {
                            sendResponse(result);
                        });
                        return true;

                    case 'get_page_structure':
                        extractPageStructure().then((structure) => {
                            sendResponse({ success: true, structure: structure });
                        });
                        return true;

                    case 'get_status':
                        sendResponse({
                            success: true,
                            isActive: this.isActive,
                            sessionId: this.visionProcessor.getSessionInfo().sessionId,
                            privacyStats: this.privacyFilter.getStats()
                        });
                        break;

                    case 'update_config':
                        Config.save(request.config).then(() => {
                            this.config = request.config;
                            this.serverComm = new ServerComm(this.config.SERVER_URL);
                            sendResponse({ success: true, message: 'Configuration updated' });
                        });
                        return true;

                    default:
                        sendResponse({ error: `Unknown request type: ${request.type}` });
                }
            } catch (error) {
                Logger.error('AGENT', 'Message handler error', error);
                sendResponse({ error: error.message });
            }
        });
    }

    /**
     * Set up mutation observer for DOM changes
     */
    setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            // Flag for page content changes
            if (this.isActive) {
                // Trigger processing on next cycle instead of immediately
                // to avoid excessive processing
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['value', 'class', 'style'],
            characterData: false
        });
    }
}

// Initialize and start the agent
let agent = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!agent) {
        agent = new PrivacyBrowserAgent();
        await agent.initialize();
    }
});

// Also initialize if script runs after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (!agent) {
            agent = new PrivacyBrowserAgent();
            await agent.initialize();
        }
    });
} else {
    if (!agent) {
        agent = new PrivacyBrowserAgent();
        agent.initialize();
    }
}

Logger.log('AGENT', 'Content script loaded');


function extractInteractiveElements() {

    const elements = document.querySelectorAll(
        "input, textarea, button, select, a"
    );

    return Array.from(elements)
        .filter(element => {

            const rect = element.getBoundingClientRect();

            return (
                rect.width > 0 &&
                rect.height > 0
            );
        })
        .map((element, index) =>
            getElementInfo(element, index)
        );
}


function detectSensitiveElements(elements) {

    return elements.map(element => {

        let sensitive = false;
        let reason = null;

        const type = (element.type || "").toLowerCase();

        const name = (element.name || "").toLowerCase();

        const placeholder =
            (element.placeholder || "").toLowerCase();

        const autocomplete =
            (element.autocomplete || "").toLowerCase();


        // Password
        if (type === "password") {

            sensitive = true;
            reason = "password";
        }


        // Email
        else if (
            type === "email" ||
            autocomplete.includes("email") ||
            name.includes("email") ||
            placeholder.includes("email")
        ) {

            sensitive = true;
            reason = "email";
        }


        // Phone
        else if (
            type === "tel" ||
            autocomplete.includes("tel") ||
            name.includes("phone") ||
            name.includes("mobile")
        ) {

            sensitive = true;
            reason = "phone";
        }


        // Credit card
        else if (
            autocomplete.includes("cc-number") ||
            name.includes("card")
        ) {

            sensitive = true;
            reason = "credit_card";
        }


        return {
            ...element,
            sensitive,
            reason
        };
    });
}


function analyzePage() {

    const elements = extractInteractiveElements();

    const analyzed = detectSensitiveElements(elements);

    return {
        url: window.location.href,
        title: document.title,
        timestamp: Date.now(),
        elements: analyzed
    };
}


chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        if (message.type === "ANALYZE_PAGE") {

            const result = analyzePage();

            sendResponse(result);
        }

        return true;
    }
);