/**
 * Agent Loop - High-level orchestration of agentic browser automation
 * 
 * This is the main execution loop that:
 * 1. Listens for user goals from popup
 * 2. Creates server session
 * 3. Repeatedly: observe → reason (Groq) → execute → repeat
 * 4. Reports progress to popup
 * 5. Handles errors and termination
 */

class AgentLoopOrchestrator {
    constructor(sessionManager, commandExecutor) {
        this.sessionManager = sessionManager;
        this.commandExecutor = commandExecutor;
        this.isRunning = false;
        this.currentSessionId = null;
        this.stepCount = 0;
        this.perf = new PerformanceMonitor();
        this.errorCount = 0;
        
        Logger.log('LOOP', 'AgentLoopOrchestrator initialized');
    }
    
    /**
     * Start agent with user goal
     */
    async start(userGoal, serverUrl = 'http://localhost:8000') {
        if (this.isRunning) {
            Logger.warn('LOOP', 'Agent already running');
            return false;
        }
        
        try {
            Logger.log('LOOP', `Starting agent with goal: ${userGoal}`);
            
            // Configure session manager
            this.sessionManager.serverUrl = serverUrl;
            
            // Create server session
            const sessionId = await this.sessionManager.startSession(userGoal);
            this.currentSessionId = sessionId;
            this.stepCount = 0;
            this.errorCount = 0;
            this.isRunning = true;
            
            Logger.log('LOOP', `Session created: ${sessionId}`);
            
            // Start main loop
            this.agentLoop();
            
            return true;
        } catch (error) {
            Logger.error('LOOP', 'Failed to start agent', error);
            this.isRunning = false;
            return false;
        }
    }
    
    /**
     * Main agent loop
     * Runs continuously until goal is achieved or error limit reached
     */
    async agentLoop() {
        Logger.log('LOOP', 'Entering agent loop');
        
        while (this.isRunning && this.errorCount < 3) {
            try {
                this.stepCount++;
                Logger.log('LOOP', `=== STEP ${this.stepCount} ===`);
                
                // Notify popup of progress
                this.notifyPopup({
                    type: 'step_started',
                    step: this.stepCount,
                    max_steps: 20
                });
                
                // Step 1: Observe current page state
                Logger.log('LOOP', 'Step 1: Observing page...');
                const action = await this.perf.measureAsync('AGENT_STEP', async () => {
                    return await this.sessionManager.observe();
                });
                
                if (!action) {
                    Logger.warn('LOOP', 'Observe returned no action');
                    await this.delay(1000);
                    continue;
                }
                
                Logger.log('LOOP', `Step 2: Received action: ${action.type}`);
                this.notifyPopup({
                    type: 'action_received',
                    action_type: action.type,
                    reason: action.reason || ''
                });
                
                // Check for completion
                if (action.type === 'FINISH') {
                    Logger.log('LOOP', `Agent finished: ${action.reason}`);
                    this.notifyPopup({
                        type: 'agent_finished',
                        reason: action.reason
                    });
                    this.isRunning = false;
                    break;
                }
                
                // Step 3: Execute action on page
                Logger.log('LOOP', `Step 3: Executing action...`);
                const result = await this.executeActionSafely(action);
                
                if (!result.success) {
                    Logger.error('LOOP', `Action failed: ${result.errorCode}`);
                    this.errorCount++;
                    
                    this.notifyPopup({
                        type: 'action_failed',
                        error_code: result.errorCode,
                        error_message: result.errorMessage,
                        error_count: this.errorCount
                    });
                    
                    // Report to server
                    await this.sessionManager.reportActionResult(
                        action,
                        false,
                        result.errorCode,
                        result.errorMessage
                    );
                    
                    // If too many errors, stop
                    if (this.errorCount >= 3) {
                        Logger.error('LOOP', 'Too many consecutive errors, stopping');
                        this.notifyPopup({
                            type: 'agent_error_limit',
                            message: 'Too many errors, agent stopped'
                        });
                        this.isRunning = false;
                    }
                    
                    continue;
                }
                
                // Reset error count on successful action
                this.errorCount = 0;
                
                Logger.log('LOOP', 'Action executed successfully');
                this.notifyPopup({
                    type: 'action_executed',
                    duration_ms: result.duration_ms
                });
                
                // Step 4: Report result to server
                Logger.log('LOOP', 'Step 4: Reporting result to server...');
                await this.sessionManager.reportActionResult(
                    action,
                    true,
                    null,
                    null
                );
                
                // Small delay before next step
                await this.delay(500);
                
            } catch (error) {
                Logger.error('LOOP', 'Loop error', error);
                this.errorCount++;
                
                this.notifyPopup({
                    type: 'loop_error',
                    error_message: error.message
                });
                
                await this.delay(2000);
            }
        }
        
        Logger.log('LOOP', 'Agent loop ended');
        this.isRunning = false;
        
        this.notifyPopup({
            type: 'agent_ended',
            steps_taken: this.stepCount,
            errors: this.errorCount
        });
    }
    
    /**
     * Execute action with error handling and validation
     */
    async executeActionSafely(action) {
        const startTime = performance.now();
        
        try {
            // Validate action before execution
            if (!action.type) {
                return {
                    success: false,
                    errorCode: 'INVALID_ACTION',
                    errorMessage: 'Action type is missing'
                };
            }
            
            // Execute via command executor
            const result = await this.commandExecutor.executeAgentAction(action);
            
            const duration = performance.now() - startTime;
            
            if (!result) {
                return {
                    success: false,
                    errorCode: 'EXECUTION_FAILED',
                    errorMessage: 'Command executor returned null',
                    duration_ms: Math.round(duration)
                };
            }
            
            return {
                ...result,
                duration_ms: Math.round(duration)
            };
            
        } catch (error) {
            const duration = performance.now() - startTime;
            
            Logger.error('LOOP', 'Action execution error', error);
            
            return {
                success: false,
                errorCode: 'EXECUTION_ERROR',
                errorMessage: error.message,
                duration_ms: Math.round(duration)
            };
        }
    }
    
    /**
     * Stop agent gracefully
     */
    async stop() {
        Logger.log('LOOP', 'Stopping agent...');
        this.isRunning = false;
        
        if (this.currentSessionId) {
            await this.sessionManager.stopSession();
        }
        
        this.notifyPopup({
            type: 'agent_stopped'
        });
    }
    
    /**
     * Notify popup of agent status/events
     */
    notifyPopup(event) {
        try {
            chrome.runtime.sendMessage({
                type: 'agent_event',
                ...event
            }).catch((err) => {
                // Popup might not be open, that's OK
                Logger.debug('LOOP', 'Popup message failed', err?.message);
            });
        } catch (error) {
            // Ignore if popup is closed
        }
    }
    
    /**
     * Utility: sleep
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            running: this.isRunning,
            session_id: this.currentSessionId,
            step: this.stepCount,
            errors: this.errorCount
        };
    }
}

/**
 * Global agent loop instance
 */
let globalAgentLoop = null;

/**
 * Initialize agent loop and attach to global scope
 */
function initializeAgentLoop() {
    if (!globalAgentLoop && typeof ClientSessionManager !== 'undefined' && typeof CommandExecutor !== 'undefined') {
        const sessionMgr = new ClientSessionManager();
        const cmdExecutor = new CommandExecutor();
        globalAgentLoop = new AgentLoopOrchestrator(sessionMgr, cmdExecutor);
        
        Logger.log('LOOP', 'Global agent loop initialized');
        
        // Make available globally
        window.agentLoop = globalAgentLoop;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAgentLoop);
} else {
    initializeAgentLoop();
}
