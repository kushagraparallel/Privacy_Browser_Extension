/**
 * COMMAND-EXECUTOR.JS ENHANCEMENT GUIDE
 * 
 * This file shows the EXACT methods needed to add to command-executor.js
 * to support the new agent loop with element validation
 * 
 * Add these methods to the CommandExecutor class
 */

/**
 * ENHANCEMENT 1: Add agent action support
 * 
 * Replace the execute() method OR add this new executeAgentAction() method
 */

// Add this new method to CommandExecutor class:
async executeAgentAction(action) {
    /**
     * Execute an action from the Groq agent with full validation
     * 
     * Args:
     *   action: {
     *     type: "CLICK" | "TYPE" | "SCROLL" | "PRESS_KEY" | "WAIT" | "NAVIGATE" | "FINISH",
     *     element_id: "agent-el-XXX",
     *     reason: "why this action",
     *     text: "for TYPE actions",
     *     key: "for PRESS_KEY actions",
     *     url: "for NAVIGATE actions",
     *     duration_ms: "for WAIT actions"
     *   }
     * 
     * Returns:
     *   {
     *     success: true/false,
     *     result: { ... },  // Action-specific result
     *     errorCode: "ERROR_CODE_IF_FAILED",
     *     errorMessage: "Human readable error",
     *     duration_ms: execution time in milliseconds
     *   }
     */
    
    const startTime = performance.now();
    
    try {
        // STEP 1: Validate action structure
        if (!action.type) {
            return {
                success: false,
                errorCode: 'MISSING_ACTION_TYPE',
                errorMessage: 'Action object missing "type" field',
                duration_ms: 0
            };
        }

        // STEP 2: Resolve element_id to actual DOM element
        if (action.type !== 'NAVIGATE' && action.type !== 'WAIT' && action.type !== 'FINISH') {
            if (!action.element_id) {
                return {
                    success: false,
                    errorCode: 'MISSING_ELEMENT_ID',
                    errorMessage: `Action type "${action.type}" requires element_id`,
                    duration_ms: 0
                };
            }

            // Get element registry from global session manager
            if (!window.sessionManager || !window.sessionManager.elementRegistry) {
                return {
                    success: false,
                    errorCode: 'NO_REGISTRY',
                    errorMessage: 'Element registry not available',
                    duration_ms: 0
                };
            }

            const registry = window.sessionManager.elementRegistry;
            const allElements = registry.getAllElements();
            const elementRef = allElements.find(e => e.agent_id === action.element_id);

            if (!elementRef) {
                return {
                    success: false,
                    errorCode: 'ELEMENT_NOT_FOUND',
                    errorMessage: `Element "${action.element_id}" not found in current observation`,
                    duration_ms: Math.round(performance.now() - startTime)
                };
            }

            // STEP 3: Validate element reference (fingerprinting)
            const validation = registry.validateReference(action.element_id, elementRef.element);
            if (!validation.valid) {
                return {
                    success: false,
                    errorCode: 'STALE_ELEMENT_REFERENCE',
                    errorMessage: `Element reference invalid: ${validation.reason}`,
                    duration_ms: Math.round(performance.now() - startTime)
                };
            }

            // STEP 4: Execute action-specific handler
            try {
                const handler = this['_execute_' + action.type];
                if (!handler) {
                    return {
                        success: false,
                        errorCode: 'UNKNOWN_ACTION_TYPE',
                        errorMessage: `Unknown action type: ${action.type}`,
                        duration_ms: Math.round(performance.now() - startTime)
                    };
                }

                const result = await handler.call(this, elementRef.element, action);

                return {
                    success: true,
                    result: result,
                    duration_ms: Math.round(performance.now() - startTime)
                };

            } catch (error) {
                Logger.error('EXECUTOR', `Action ${action.type} threw error`, error);
                return {
                    success: false,
                    errorCode: 'EXECUTION_ERROR',
                    errorMessage: error.message,
                    duration_ms: Math.round(performance.now() - startTime)
                };
            }
        } else {
            // For actions that don't need elements (NAVIGATE, WAIT, FINISH)
            try {
                const handler = this['_execute_' + action.type];
                if (!handler) {
                    return {
                        success: false,
                        errorCode: 'UNKNOWN_ACTION_TYPE',
                        errorMessage: `Unknown action type: ${action.type}`,
                        duration_ms: 0
                    };
                }

                const result = await handler.call(this, null, action);

                return {
                    success: true,
                    result: result,
                    duration_ms: Math.round(performance.now() - startTime)
                };

            } catch (error) {
                Logger.error('EXECUTOR', `Action ${action.type} threw error`, error);
                return {
                    success: false,
                    errorCode: 'EXECUTION_ERROR',
                    errorMessage: error.message,
                    duration_ms: Math.round(performance.now() - startTime)
                };
            }
        }

    } catch (error) {
        Logger.error('EXECUTOR', 'Unexpected error in executeAgentAction', error);
        return {
            success: false,
            errorCode: 'UNEXPECTED_ERROR',
            errorMessage: error.message,
            duration_ms: Math.round(performance.now() - startTime)
        };
    }
}

/**
 * ENHANCEMENT 2: Add action handlers
 * 
 * Add these action handler methods to CommandExecutor class
 * Naming: _execute_[ACTION_TYPE]
 */

async _execute_CLICK(element, action) {
    /**
     * Click on an element
     */
    if (!element) throw new Error('CLICK requires an element');
    
    try {
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this._delay(200);

        // Click
        element.click();
        await this._delay(500);

        return {
            clicked: true,
            element_tag: element.tagName.toLowerCase(),
            element_text: element.textContent?.substring(0, 50) || ''
        };
    } catch (error) {
        Logger.error('EXECUTOR', 'CLICK error', error);
        throw error;
    }
}

async _execute_TYPE(element, action) {
    /**
     * Type text into an element (usually input/textarea)
     */
    if (!element) throw new Error('TYPE requires an element');
    if (!action.text) throw new Error('TYPE requires "text" field');
    
    try {
        // Focus and clear
        element.focus();
        await this._delay(100);

        // Clear existing value
        if (element.value) {
            element.value = '';
        }

        // Type character by character to trigger input events
        for (const char of action.text) {
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            await this._delay(10);
        }

        await this._delay(200);

        return {
            typed: action.text.length + ' characters',
            element_tag: element.tagName.toLowerCase(),
            final_value_length: element.value.length
        };
    } catch (error) {
        Logger.error('EXECUTOR', 'TYPE error', error);
        throw error;
    }
}

async _execute_FOCUS(element, action) {
    /**
     * Focus on an element (useful for textboxes, buttons)
     */
    if (!element) throw new Error('FOCUS requires an element');
    
    try {
        element.focus();
        await this._delay(100);

        return {
            focused: true,
            element_tag: element.tagName.toLowerCase(),
            focused_type: element.getAttribute('type') || 'unknown'
        };
    } catch (error) {
        Logger.error('EXECUTOR', 'FOCUS error', error);
        throw error;
    }
}

async _execute_SCROLL(element, action) {
    /**
     * Scroll an element into view
     */
    if (!element) throw new Error('SCROLL requires an element');
    
    try {
        element.scrollIntoView({
            behavior: action.smooth !== false ? 'smooth' : 'auto',
            block: action.block || 'center'
        });
        await this._delay(500);

        const rect = element.getBoundingClientRect();
        return {
            scrolled: true,
            in_viewport: rect.top >= 0 && rect.top < window.innerHeight,
            position: { x: rect.x, y: rect.y }
        };
    } catch (error) {
        Logger.error('EXECUTOR', 'SCROLL error', error);
        throw error;
    }
}

async _execute_PRESS_KEY(element, action) {
    /**
     * Press a key on focused element
     */
    if (!action.key) throw new Error('PRESS_KEY requires "key" field');
    
    try {
        // If element specified, focus it first
        if (element) {
            element.focus();
            await this._delay(100);
        } else {
            element = document.activeElement;
        }

        // Create and dispatch keyboard event
        const keyEvent = new KeyboardEvent('keydown', {
            key: action.key,
            code: action.key,
            bubbles: true,
            cancelable: true
        });

        element?.dispatchEvent(keyEvent);
        await this._delay(100);

        // Also dispatch keyup
        const keyUpEvent = new KeyboardEvent('keyup', {
            key: action.key,
            code: action.key,
            bubbles: true,
            cancelable: true
        });

        element?.dispatchEvent(keyUpEvent);
        await this._delay(200);

        return {
            key_pressed: action.key,
            element_tag: element?.tagName.toLowerCase() || 'unknown'
        };
    } catch (error) {
        Logger.error('EXECUTOR', 'PRESS_KEY error', error);
        throw error;
    }
}

async _execute_WAIT(element, action) {
    /**
     * Wait for specified duration (useful for async operations)
     */
    const duration = action.duration_ms || 1000;
    
    try {
        await this._delay(duration);

        return {
            waited_ms: duration
        };
    } catch (error) {
        Logger.error('EXECUTOR', 'WAIT error', error);
        throw error;
    }
}

async _execute_NAVIGATE(element, action) {
    /**
     * Navigate to a URL
     */
    if (!action.url) throw new Error('NAVIGATE requires "url" field');
    
    try {
        window.location.href = action.url;
        // Wait for navigation
        await this._delay(2000);

        return {
            navigated: true,
            url: action.url
        };
    } catch (error) {
        Logger.error('EXECUTOR', 'NAVIGATE error', error);
        throw error;
    }
}

async _execute_FINISH(element, action) {
    /**
     * Finish agent session
     */
    return {
        finished: true,
        reason: action.reason || 'Task completed'
    };
}

/**
 * ENHANCEMENT 3: Add utility methods
 */

async _delay(ms) {
    /**
     * Sleep for specified milliseconds
     */
    return new Promise(resolve => setTimeout(resolve, ms));
}

_getElementInfo(element) {
    /**
     * Get safe info about an element (no sensitive values)
     */
    const rect = element.getBoundingClientRect();
    return {
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type'),
        role: element.getAttribute('role'),
        visible: rect.width > 0 && rect.height > 0,
        position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        }
    };
}

/**
 * HOW TO INTEGRATE:
 * 
 * 1. Add this entire block to CommandExecutor class
 * 2. Call executeAgentAction() from agent-loop.js (already done)
 * 3. Test with QUICK_START.md scenarios
 * 
 * The execute() method still works for legacy commands.
 * executeAgentAction() is the new agent-powered method.
 */
