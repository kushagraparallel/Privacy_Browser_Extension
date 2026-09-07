# Production-Grade Agentic Browser Automation - Implementation Guide

## Executive Summary

This guide upgrades the Privacy Browser Agent from a basic demo into a production-grade agentic browser automation system with:

✅ **Groq-powered LLM reasoning** - Server-side agent loop  
✅ **Session management** - Isolated per-user state  
✅ **Element registry** - Stable "agent-el-XXX" identifiers  
✅ **User query support** - Natural language goals  
✅ **Privacy protection** - PII never reaches LLM  
✅ **Action verification** - One action at a time with validation  
✅ **DOM stability** - Fingerprinting and stale reference detection  
✅ **Configurable server URL** - Works in any environment  

---

## ✅ COMPLETED COMPONENTS

### 1. **server/main.py** - NEW PRODUCTION SERVER ✓
**Status**: Complete and replaced

**Key Features**:
- Groq integration with structured JSON responses
- Session-scoped state management (AgentSession class)
- Action validation with Pydantic models
- Privacy protection (ElementMetadata sanitization)
- Step-by-step agent loop (one action at a time)
- Comprehensive error handling
- Configurable via environment variables

**Endpoints**:
```
POST /api/agent/start              - Start new session
POST /api/agent/observe             - Submit observation, get next action
POST /api/agent/action-result       - Report action outcome
POST /api/agent/stop                - Stop session
GET  /api/agent/status/{session_id} - Get session status
```

**Configuration** (in `.env`):
```
GROQ_API_KEY=your_key_here
GROQ_MODEL=mixtral-8x7b-32768
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
CORS_ORIGINS=http://localhost:3000,chrome-extension://*
MAX_AGENT_STEPS=20
```

### 2. **server/requirements.txt** - UPDATED ✓
**Status**: Added Groq

```
groq==0.4.2
httpx==0.25.0
```

### 3. **server/.env.example** - UPDATED ✓
**Status**: Full Groq configuration template

### 4. **extension/session-manager.js** - NEW ✓
**Status**: Complete

**Key Classes**:
- `ElementRegistry` - Manages stable "agent-el-XXX" identifiers
- `ClientSessionManager` - Client-side session orchestration

**Features**:
- Stable element IDs with fingerprinting
- Privacy detection (never sends sensitive values)
- Observation building
- Action result reporting
- DOM generation tracking

---

## 🔄 COMPONENTS STILL NEEDING UPDATE

### 1. **extension/manifest.json** - ADD SESSION MANAGER

**Add to content_scripts array**:
```json
{
  "matches": ["<all_urls>"],
  "js": [
    "node_modules/onnxruntime-web/dist/ort.all.min.js",
    "utils.js",
    "privacy-filter.js",
    "vision-processor.js",
    "command-executor.js",
    "session-manager.js",  // ← NEW
    "agent-loop.js",       // ← NEW (to be created)
    "content.js"
  ]
}
```

### 2. **extension/content.js** - REWRITE FOR AGENT LOOP

**Current state**: Processes screenshots, sends to old hardcoded server  
**New state**: Integrate with session manager for Groq-powered loop

**New structure**:
```javascript
class PrivacyBrowserAgent {
    constructor() {
        this.sessionManager = new ClientSessionManager();
        this.commandExecutor = new CommandExecutor();
        this.privacyFilter = new PrivacyFilter();
        // Remove old hardcoded planner
    }
    
    async initialize() {
        // Load config
        this.sessionManager.serverUrl = config.SERVER_URL;
        // Setup message listeners
    }
    
    async startAgentSession(userGoal) {
        // User entered goal in popup
        const sessionId = await this.sessionManager.startSession(userGoal);
        this.agentLoop();
    }
    
    async agentLoop() {
        // Infinite loop until completion
        while (this.sessionManager.isRunning) {
            try {
                // Get next action from Groq
                const action = await this.sessionManager.observe();
                
                if (!action) break;
                
                if (action.type === 'FINISH') {
                    this.sessionManager.isRunning = false;
                    break;
                }
                
                // Execute action
                const result = await this.commandExecutor.executeAgentAction(action);
                
                // Report result
                await this.sessionManager.reportActionResult(
                    action,
                    result.success,
                    result.errorCode,
                    result.errorMessage
                );
                
            } catch (error) {
                Logger.error('AGENT', 'Loop error', error);
                break;
            }
        }
    }
}
```

### 3. **extension/agent-loop.js** - NEW FILE

**Purpose**: High-level agent orchestration  
**Key responsibilities**:
- Listen for user goal from popup
- Start session with server
- Continuous observation + action loop
- Report status to popup
- Handle errors and retry

### 4. **extension/command-executor.js** - ENHANCE

**Current**:
- `execute(command)` - takes generic command object

**Enhanced**:
```javascript
async executeAgentAction(action) {
    // action = {type: "CLICK", element_id: "agent-el-17", reason: "..."}
    
    // 1. Resolve element_id to actual DOM element
    const element = this.resolveAgentElement(action.element_id);
    if (!element) {
        return {
            success: false,
            errorCode: 'ELEMENT_NOT_FOUND',
            errorMessage: `Element ${action.element_id} not found`
        };
    }
    
    // 2. Validate element is still correct
    const validation = this.validateElement(element, action.element_id);
    if (!validation.valid) {
        return {
            success: false,
            errorCode: 'STALE_ELEMENT_REFERENCE',
            errorMessage: validation.reason
        };
    }
    
    // 3. Execute action
    try {
        const result = await this.execute[action.type](element, action);
        return {
            success: true,
            result: result
        };
    } catch (error) {
        return {
            success: false,
            errorCode: 'EXECUTION_ERROR',
            errorMessage: error.message
        };
    }
}

// Specific action handlers
async execute_CLICK(element, action) { /* ... */ }
async execute_TYPE(element, action) { /* ... */ }
async execute_SCROLL(element, action) { /* ... */ }
// etc.
```

### 5. **extension/popup.js & popup.html** - USER QUERY UI

**Current**: Start/Stop/ProcessNow buttons  
**New**: Text input for natural language goals

**popup.html changes**:
```html
<div id="userGoalSection">
    <label for="userGoal">What do you want to do?</label>
    <textarea id="userGoal" placeholder="e.g., Log in to my account"></textarea>
    <button id="startAgentBtn">Start Agent</button>
</div>

<div id="agentStatusSection" style="display:none;">
    <h3>Agent Status</h3>
    <p>Goal: <span id="goalText"></span></p>
    <p>Step: <span id="stepNumber">0</span> / <span id="maxSteps">20</span></p>
    <p>Current Action: <span id="actionText">Waiting...</span></p>
    <p>Status: <span id="statusBadge">Running</span></p>
    <button id="stopAgentBtn">Stop Agent</button>
</div>
```

**popup.js changes**:
```javascript
class PopupController {
    async startAgent() {
        const goal = document.getElementById('userGoal').value;
        if (!goal) {
            alert('Please enter a goal');
            return;
        }
        
        // Send message to content script
        const sessionId = await this.sendToContent({
            type: 'start_agent_session',
            goal: goal
        });
        
        this.monitorSession(sessionId);
    }
}
```

### 6. **extension/utils.js** - ADD SERVER_URL HELPER

**Add Config enhancement**:
```javascript
class Config {
    static DEFAULT = {
        SERVER_URL: 'http://localhost:8000',  // ← User can change this
        // ... rest
    };
    
    static async getServerUrl() {
        const config = await this.load();
        return config.SERVER_URL;
    }
}
```

### 7. **extension/privacy-filter.js** - NO MAJOR CHANGES

**Already has**:
- PII detection ✓
- Redaction ✓
- Just needs to integrate with ElementRegistry for marking sensitive fields

---

## 📋 STEP-BY-STEP SETUP INSTRUCTIONS

### Server Setup

```bash
cd server

# 1. Install dependencies
pip install -r requirements.txt

# 2. Create .env with your Groq API key
cp .env.example .env
# Edit .env and add: GROQ_API_KEY=your_groq_api_key

# 3. Run server
python main.py
```

Server will start on `http://localhost:8000`

### Extension Setup

```bash
# 1. Update manifest.json to include new files
# See manifest changes above

# 2. Create agent-loop.js (see template below)

# 3. Update content.js to use SessionManager

# 4. Update popup.js for user query input

# 5. Load in Chrome:
#    - chrome://extensions
#    - Developer mode: ON
#    - Load unpacked → select /extension folder
```

---

## 🔍 EXAMPLE: USER QUERY FLOW

### User enters goal: "Log in to my account"

```
Popup
  │
  └─→ Content Script (startAgentSession)
       │
       └─→ POST /api/agent/start
            {
              "user_goal": "Log in to my account",
              "page_context": {...}
            }
            ↓
            Response: session_id = "sess_abc123..."
       │
       └─→ Enter agentLoop()
            │
            ├─→ Build observation (DOM elements, privacy check)
            │
            └─→ POST /api/agent/observe
                 {
                   "session_id": "sess_abc123...",
                   "observation": {
                     "elements": [
                       {
                         "agent_element_id": "agent-el-1",
                         "tag": "input",
                         "type": "email",
                         "sensitive_type": "email",
                         "text": "[EMAIL REDACTED]"
                       },
                       ...
                     ]
                   }
                 }
                 ↓
                 Server (Groq Agent):
                 - Sees user goal
                 - Sees current elements
                 - Reasons: "Email field visible, should fill it"
                 - Returns:
                   {
                     "action": {
                       "type": "CLICK",
                       "element_id": "agent-el-1",
                       "reason": "Focus email field to enter credentials"
                     }
                   }
            │
            ├─→ Validate action
            │    - Check element_id exists in observation
            │    - Check element fingerprint is stable
            │    - Reject if STALE_ELEMENT_REFERENCE
            │
            ├─→ Execute action
            │    - Click on element
            │    - Wait for DOM to settle
            │    - Capture new state
            │
            ├─→ POST /api/agent/action-result
            │    {
            │      "session_id": "sess_abc123...",
            │      "result": {
            │        "action_id": "act_xyz...",
            │        "success": true,
            │        "new_observation": { ... }
            │      }
            │    }
            │
            └─→ Loop back to observe (next action)

Agent eventually returns:
  { "status": "FINISHED", "message": "Login successful" }
  ↓
Session ends
```

---

## 🛡️ PRIVACY ARCHITECTURE

### What stays local (browser):
✓ Raw DOM values  
✓ Actual passwords, emails, credit cards  
✓ Sensitive field detection  
✓ Redaction operations  
✓ Command execution  

### What goes to Groq (sanitized):
✓ "agent-el-1: <input type='email'> [EMAIL REDACTED]"  
✓ Element structure (tags, roles, attributes)  
✓ User goal (natural language)  
✗ Never: actual values of sensitive fields  
✗ Never: passwords, tokens, credit cards  

### Example element sent to Groq:

```json
{
  "agent_element_id": "agent-el-17",
  "tag": "input",
  "role": "textbox",
  "type": "password",
  "text": "[PASSWORD REDACTED]",  // ← Never actual value
  "placeholder": "Enter password",
  "aria_label": "Password field",
  "visible": true,
  "enabled": true,
  "interactive": true,
  "sensitive": true,
  "sensitive_type": "password",
  "bbox": { "x": 100, "y": 200, "width": 300, "height": 40 }
}
```

---

## ⚙️ CONFIGURATION

### Browser Extension
- **SERVER_URL**: Configurable in popup settings
  ```
  Development: http://localhost:8000
  Production: https://api.yourdomain.com
  ```

### Server Environment (`.env`)
```
GROQ_API_KEY=your_key_here
GROQ_MODEL=mixtral-8x7b-32768
MAX_AGENT_STEPS=20
CORS_ORIGINS=http://localhost:3000,chrome-extension://*
```

### Groq Model Selection
- **mixtral-8x7b-32768**: Fast, good for automation
- **llama2-70b-4096**: More capable but slower
- **gemma-7b-it**: Lightweight

---

## ✅ PRODUCTION CHECKLIST

- [ ] GROQ_API_KEY configured in .env
- [ ] server/main.py running successfully
- [ ] Extension loads without errors
- [ ] Popup shows user goal input
- [ ] Can start agent session
- [ ] Agent receives observations
- [ ] Groq returns valid actions
- [ ] Actions execute on page
- [ ] Privacy checks working (no PII in server logs)
- [ ] Stale element detection working
- [ ] Agent stops at goal completion
- [ ] Error handling doesn't crash
- [ ] CORS works (no blocked requests)
- [ ] Session expires correctly

---

## 📊 EXPECTED BEHAVIOR

### Successful Flow

```
User enters: "Find the search box and type 'laptop'"
    ↓
Agent observes page
    ↓
Agent reasons: "I see a search input with id='searchBox'"
    ↓
Agent returns: CLICK on search box
    ↓
Browser executes click
    ↓
Agent observes: search box is now focused
    ↓
Agent returns: TYPE "laptop"
    ↓
Browser types text
    ↓
Agent observes: text entered successfully
    ↓
Agent returns: FINISH "Task complete"
    ↓
Session ends
```

### Error Cases

```
1. Stale Element Reference:
   - Action requests element "agent-el-5"
   - Element fingerprint no longer matches
   - Browser returns: STALE_ELEMENT_REFERENCE
   - Server requests re-observation
   - Agent reasons again with fresh data

2. Element Not Found:
   - Action requests element "agent-el-5"
   - Element doesn't exist in current observation
   - Browser returns: ELEMENT_NOT_FOUND
   - Server rejects action, returns error
   - Agent must observe and adapt

3. Max Steps Exceeded:
   - After 20 actions with no completion
   - Server returns: MAX_STEPS_EXCEEDED
   - Session ends with failure
```

---

## 🚀 NEXT STEPS

1. **Implement agent-loop.js** - High-level orchestration
2. **Update content.js** - Integrate SessionManager
3. **Update popup.js** - User goal input
4. **Update manifest.json** - Include new scripts
5. **Test with localhost:8000**
6. **Set up .env with real Groq API key**
7. **Test end-to-end on test.html**
8. **Deploy server to production**

---

## 📚 FILES SUMMARY

| File | Status | Purpose |
|------|--------|---------|
| server/main.py | ✅ NEW | Groq agent server |
| server/requirements.txt | ✅ UPDATED | Added groq dependency |
| server/.env.example | ✅ UPDATED | Configuration template |
| extension/session-manager.js | ✅ NEW | Element registry + client session mgmt |
| extension/agent-loop.js | ⏳ TODO | Agent loop orchestration |
| extension/manifest.json | ⏳ TODO | Add new scripts |
| extension/content.js | ⏳ TODO | Integrate SessionManager |
| extension/command-executor.js | ⏳ ENHANCE | Support agent actions |
| extension/popup.js | ⏳ TODO | User goal input |
| extension/popup.html | ⏳ TODO | Goal input UI |
| extension/privacy-filter.js | ✅ OK | No changes needed |
| extension/utils.js | ⏳ ENHANCE | Add SERVER_URL helper |

---

## 🎯 SECURITY & PRIVACY GUARANTEES

✅ **API keys server-side only** - GROQ_API_KEY never in browser  
✅ **Sensitive values redacted** - [PASSWORD REDACTED] sent to Groq  
✅ **Element IDs stable** - agent-el-XXX with fingerprinting  
✅ **Stale references detected** - Generation tracking  
✅ **One action at a time** - No script injection  
✅ **Sandboxed execution** - Only allowed action types  
✅ **Privacy-first capture** - Redaction before transmission  

---

**End of Implementation Guide**

For detailed code examples, see the newly created files in `/server/` and `/extension/`
