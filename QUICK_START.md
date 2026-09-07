# Production Agentic Browser Agent - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### 1. Server Setup

```bash
cd server

# Install Python dependencies
pip install -r requirements.txt

# Create .env file with Groq API key
cp .env.example .env

# Edit .env and add your key:
# GROQ_API_KEY=gsk_your_actual_key_here

# Run server
python main.py
```

Server will start on `http://localhost:8000`

### 2. Browser Extension Setup

```bash
# Go to Chrome
chrome://extensions

# Enable Developer Mode (top right toggle)

# Click "Load unpacked"

# Select: /extension folder

# Extension will load and show icon in toolbar
```

### 3. Test It

1. Open test.html in Chrome (or any website)
2. Click extension icon → Popup opens
3. Enter goal: **"Log in with email"** or **"Find the search box"**
4. Click **Start Agent**
5. Watch the agent loop execute in real-time

---

## ✅ VERIFICATION CHECKLIST

- [ ] Server running on localhost:8000
- [ ] Extension loads without errors  
- [ ] Popup shows goal input field
- [ ] Can type goal and click "Start Agent"
- [ ] Popup shows "Session created" message
- [ ] Agent receives action from Groq
- [ ] Agent executes action on page
- [ ] New log entries appear in popup
- [ ] Agent completes or stops gracefully
- [ ] No password/card/email values in server logs

---

## 📊 ARCHITECTURE OVERVIEW

```
User Interface (Popup)
    ↓
[User enters goal: "Log in to my account"]
    ↓
Content Script (agent-loop.js)
    ↓
ClientSessionManager
    ├─ ElementRegistry (stable IDs)
    └─ Privacy detection
    ↓
POST /api/agent/start → Server
    ↓
AgentSession (server/main.py)
    ├─ Stores user goal
    ├─ Conversation history
    └─ Action tracking
    ↓
User queries Groq with:
  - Current observation (page state)
  - User goal
  - Previous action results
    ↓
Groq returns next Action (JSON):
  {
    "type": "CLICK",
    "element_id": "agent-el-17",
    "reason": "Click email field"
  }
    ↓
Browser validates & executes
    ↓
Report result back to server
    ↓
Loop repeats until FINISH
```

---

## 🔐 PRIVACY GUARANTEE

### What reaches Groq:
✓ Element structure only  
✓ User goals  
✓ Action results  
✗ NO passwords, emails, credit cards  

### Example sensitive field sent to Groq:
```json
{
  "agent_element_id": "agent-el-5",
  "tag": "input",
  "type": "password",
  "text": "[PASSWORD REDACTED]",  // ← Never actual value
  "placeholder": "Enter password",
  "sensitive": true,
  "sensitive_type": "password"
}
```

---

## 🧪 TEST SCENARIOS

### Scenario 1: Simple Click
**Goal**: "Click the search button"

```
Expected flow:
1. Agent observes page
2. Finds search button
3. Clicks it
4. Reports success
5. Finishes
```

### Scenario 2: Form Fill
**Goal**: "Fill in the contact form with John Doe and john@example.com"

```
Expected flow:
1. Observe page
2. Find name field
3. Click and type "John Doe"
4. Find email field
5. Click and type "john@example.com"  (REDACTED when sent to server)
6. Find submit button
7. Click submit
8. Finish
```

### Scenario 3: Error Handling
**Goal**: "Click an element that doesn't exist"

```
Expected flow:
1. Agent tries to click
2. Element not found in observation
3. Server returns ELEMENT_NOT_FOUND error
4. Agent observes again
5. Either retries with different element or reports failure
```

---

## 📋 FILES SUMMARY

| File | Purpose | Status |
|------|---------|--------|
| **server/main.py** | Groq agent server | ✅ Ready |
| **server/requirements.txt** | Dependencies | ✅ Ready |
| **extension/session-manager.js** | Element registry + session | ✅ Ready |
| **extension/agent-loop.js** | Main agent loop | ✅ Ready |
| **extension/popup.html** | UI with goal input | ✅ Ready |
| **extension/popup.js** | Popup logic | ✅ Ready |
| **extension/manifest.json** | Updated with new scripts | ✅ Ready |
| **extension/content.js** | ⏳ Needs integration (see below) |
| **extension/command-executor.js** | ⏳ Needs element validation |

---

## 🔧 REMAINING INTEGRATION WORK

### 1. content.js - Add Agent Loop Integration

**Location**: After `initialize()` method

```javascript
async initialize() {
    // ... existing code ...
    
    // NEW: Setup agent loop
    this.setupAgentLoopIntegration();
}

setupAgentLoopIntegration() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'start_agent_session') {
            this.startAgentSession(request.goal, request.serverUrl)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // Will respond async
        }
        
        if (request.type === 'stop_agent_session') {
            this.stopAgentSession()
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        }
    });
}

async startAgentSession(userGoal, serverUrl) {
    if (globalAgentLoop && !globalAgentLoop.isRunning) {
        const success = await globalAgentLoop.start(userGoal, serverUrl);
        return {
            success: success,
            session_id: globalAgentLoop.currentSessionId
        };
    }
    return { success: false, error: 'Agent loop not initialized' };
}

async stopAgentSession() {
    if (globalAgentLoop && globalAgentLoop.isRunning) {
        await globalAgentLoop.stop();
    }
}
```

### 2. command-executor.js - Enhance for Element Validation

**Add this method**:

```javascript
async executeAgentAction(action) {
    // Resolve element_id to DOM element
    if (!action.element_id) {
        return {
            success: false,
            errorCode: 'MISSING_ELEMENT_ID',
            errorMessage: 'Action has no element_id'
        };
    }
    
    // Get element registry from global agent loop
    if (!globalAgentLoop || !globalAgentLoop.sessionManager.elementRegistry) {
        return {
            success: false,
            errorCode: 'NO_REGISTRY',
            errorMessage: 'Element registry not available'
        };
    }
    
    const registry = globalAgentLoop.sessionManager.elementRegistry;
    
    // Build list of current elements
    const currentElements = registry.getAllElements();
    const current = currentElements.find(e => e.agent_id === action.element_id);
    
    if (!current) {
        return {
            success: false,
            errorCode: 'ELEMENT_NOT_FOUND',
            errorMessage: `Element ${action.element_id} not in observation`
        };
    }
    
    // Validate fingerprint
    const validation = registry.validateReference(action.element_id, current.element);
    if (!validation.valid) {
        return {
            success: false,
            errorCode: 'STALE_ELEMENT_REFERENCE',
            errorMessage: `Element reference invalid: ${validation.reason}`
        };
    }
    
    // Execute action
    try {
        const result = await this.execute[action.type](current.element, action);
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

// Action handlers
async execute_CLICK(element, action) {
    element.click();
    await this.waitForDOM(500);
    return { clicked: true };
}

async execute_TYPE(element, action) {
    element.focus();
    element.value = '';
    for (const char of action.text) {
        element.value += char;
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return { typed: action.text.length + ' characters' };
}

async execute_SCROLL(element, action) {
    element.scrollIntoView({ behavior: 'smooth' });
    await this.waitForDOM(300);
    return { scrolled: true };
}

async execute_PRESS_KEY(element, action) {
    const event = new KeyboardEvent('keydown', {
        key: action.key,
        code: action.key,
        bubbles: true
    });
    element.dispatchEvent(event);
    await this.waitForDOM(300);
    return { key_pressed: action.key };
}

async execute_WAIT(element, action) {
    await this.waitForDOM(action.duration_ms || 1000);
    return { waited: action.duration_ms };
}

async execute_NAVIGATE(element, action) {
    window.location.href = action.url;
    await this.waitForDOM(2000);
    return { navigated: action.url };
}

async execute_FINISH(element, action) {
    return { finished: true };
}

async waitForDOM(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 🌐 ENVIRONMENT CONFIGURATION

### Development (.env)
```
GROQ_API_KEY=gsk_your_dev_key
GROQ_MODEL=mixtral-8x7b-32768
SERVER_HOST=localhost
SERVER_PORT=8000
CORS_ORIGINS=http://localhost:3000,chrome-extension://*
```

### Production (.env)
```
GROQ_API_KEY=gsk_your_prod_key
GROQ_MODEL=mixtral-8x7b-32768
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
CORS_ORIGINS=https://yourdomain.com,chrome-extension://*
LOG_LEVEL=WARNING
```

---

## 🐛 TROUBLESHOOTING

### Issue: "Session not active" error
**Solution**: Server not running. Check:
```bash
curl http://localhost:8000/api/analytics
# Should return server stats
```

### Issue: Popup says "Content script not ready"
**Solution**: Reload extension
```
chrome://extensions → Privacy Agent → Reload button
```

### Issue: Agent doesn't respond to goals
**Solution**: Check content.js has agent-loop.js integration (see above)

### Issue: Extension missing element registry
**Solution**: Verify manifest.json has session-manager.js before content.js

### Issue: "GROQ_API_KEY not found"
**Solution**: Set environment variable:
```bash
export GROQ_API_KEY=gsk_your_key
python main.py
```

---

## 📈 NEXT STEPS AFTER VERIFICATION

1. ✅ **Verify all components load** (use checklist above)
2. ✅ **Test basic click action** (see test scenarios)
3. ✅ **Test error handling** (try clicking non-existent element)
4. ✅ **Monitor privacy** (check server logs for any PII - should be none)
5. ⏳ **Deploy server** (containerize or run on cloud)
6. ⏳ **Publish extension** (submit to Chrome Web Store)
7. ⏳ **Scale testing** (multiple users, complex flows)

---

## 📚 DOCUMENTATION

- **Architecture**: [PRODUCTION_UPGRADE.md](PRODUCTION_UPGRADE.md)
- **API Endpoints**: See `server/main.py` docstrings
- **Element Registry**: See `extension/session-manager.js` comments
- **Privacy Details**: See [PRODUCTION_UPGRADE.md](PRODUCTION_UPGRADE.md#-privacy-architecture)

---

## 🎓 UNDERSTANDING THE AGENT LOOP

```
Step 1: Observe
  ├─ Capture current DOM state
  ├─ Redact sensitive values
  ├─ Generate stable element IDs
  └─ Send to server

Step 2: Reason (Groq LLM)
  ├─ Understand user goal
  ├─ Analyze current page state
  ├─ Decide next action
  └─ Return Action JSON

Step 3: Execute
  ├─ Validate element still exists
  ├─ Check element fingerprint
  ├─ Run command (click/type/etc)
  └─ Wait for DOM to settle

Step 4: Report
  ├─ Send result to server
  ├─ Include new page state
  └─ Loop back to Step 1

Until: Agent returns FINISH or MAX_STEPS reached
```

---

**Ready to test?** Start with Quick Setup above! 🚀
