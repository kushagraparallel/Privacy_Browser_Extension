# Privacy Browser Agent 🔒

A privacy-preserving vision agent that runs directly in your browser, enabling secure automation and task assistance without exposing sensitive data to servers.

## Overview

The Privacy Browser Agent bridges on-device AI inference with server-side reasoning capabilities while maintaining strict data privacy. It performs local visual perception, redacts sensitive/PII data, and only transmits anonymized content to the server for processing.

### Key Features

- **Local Vision Processing**: Lightweight vision models run entirely in the browser (via ONNX Runtime Web)
- **Privacy-First Design**: Automatic detection and redaction of passwords, emails, credit cards, SSNs, and other PII
- **Dynamic Redaction**: Real-time masking/blurring of sensitive visual elements
- **Server Integration**: Send anonymized screenshots to LLM/VLM for semantic understanding
- **Action Execution**: Receive and execute commands from the server agent
- **Performance Optimized**: Minimal resource consumption with caching and batching

## Architecture

```
┌─────────────────────────────────┐
│   Browser Extension (Client)    │
├─────────────────────────────────┤
│ • Screen Capture                │
│ • Local Vision Model (ViT)      │
│ • Privacy Filter (Redaction)    │
│ • Command Executor              │
└──────────────┬──────────────────┘
               │
               │ Anonymized Screenshots
               │ + Page Structure
               │
               ▼
┌─────────────────────────────────┐
│  Server (FastAPI/Python)        │
├─────────────────────────────────┤
│ • Vision Analysis               │
│ • Privacy Validation            │
│ • LLM/VLM Processing            │
│ • Action Planning               │
└─────────────────────────────────┘
```

## Project Structure

```
Privacy_Browser_Agent/
├── extension/                 # Chrome/Firefox Extension
│   ├── manifest.json         # Extension configuration
│   ├── content.js            # Main agent orchestration
│   ├── background.js         # Service worker
│   ├── popup.html/js/css     # UI panel
│   ├── utils.js              # Shared utilities
│   ├── privacy-filter.js     # PII detection & redaction
│   ├── vision-processor.js   # Visual analysis
│   ├── command-executor.js   # Action execution
│   ├── styles.css            # UI styles
│   └── libs/                 # ONNX Runtime and models
│
├── server/                   # FastAPI Backend
│   ├── main.py              # API endpoints
│   ├── requirements.txt      # Python dependencies
│   └── .env                 # Configuration
│
└── README.md               # This file
```

## Installation

### Client-Side (Browser Extension)

1. **Chrome**: 
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/` folder

2. **Firefox**:
   - Open `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `extension/manifest.json`

### Server-Side (Python Backend)

1. **Requirements**:
   - Python 3.9+
   - pip

2. **Installation**:
   ```bash
   cd server
   pip install -r requirements.txt
   ```

3. **Running**:
   ```bash
   python main.py
   ```
   Server will start at `http://localhost:8000`

4. **Verify**:
   ```bash
   curl http://localhost:8000/health
   ```

## Configuration

### Client Settings (Popup UI)

- **Server URL**: Backend server address (default: `http://localhost:8000`)
- **Enable Privacy Filter**: Toggle PII detection
- **Redaction Mode**: 
  - `blur`: Gaussian blur
  - `black`: Black box overlay
  - `semantic`: Labeled semantic obfuscation

### Environment Variables

Create `.env` file in `server/` folder:
```env
LOG_LEVEL=INFO
MAX_SCREENSHOTS=1000
CACHE_ENABLED=true
```

## Usage

### Starting the Agent

1. **Open Extension Popup**: Click Privacy Agent icon in toolbar
2. **Click "Start Monitoring"**: Begin continuous screen processing
3. **View Status**: Monitor privacy statistics and server connection

### Processing Flow

1. **Screen Capture**: Extension captures visible viewport
2. **Privacy Analysis**: Local detection of sensitive elements
3. **Redaction**: Automatic masking of PII before transmission
4. **Server Processing**: Anonymized data sent to backend
5. **Action Generation**: Server plans actions based on analysis
6. **Command Execution**: Client receives and executes commands

## API Endpoints

### Health Check
```bash
GET /health
```

### Process Screenshot
```bash
POST /api/process-screen
Content-Type: application/json

{
  "screenshot": {...},
  "pageStructure": {...},
  "redactionMask": {...},
  "sessionId": "session_xxx"
}

Response:
{
  "success": true,
  "analysis": {...},
  "commands": [...]
}
```

### Validate Privacy
```bash
POST /api/validate-privacy
Content-Type: application/json

{
  "redactions": [...],
  "stats": {...}
}

Response:
{
  "compliant": true,
  "redaction_coverage": 15,
  "sensitive_detected": 20
}
```

### Analytics
```bash
GET /api/analytics

Response:
{
  "screenshots_processed": 150,
  "actions_planned": 45,
  "timestamp": "2024-01-15T10:30:00"
}
```

## Privacy Redaction

### Detected Elements

The Privacy Filter automatically detects:

- **Passwords**: Input fields with `type="password"` and filled values
- **Email Addresses**: Regex pattern matching `[user]@[domain].[ext]`
- **Phone Numbers**: US/International formats
- **Social Security Numbers**: Format `XXX-XX-XXXX`
- **Credit Cards**: 13-19 digit numbers (Luhn validated)
- **Sensitive Input Fields**: Fields with sensitive labels (address, DOB, license, etc.)

### Redaction Methods

**Blur**: Gaussian blur filter applied to region
```javascript
// In privacy-filter.js
ctx.filter = `blur(${this.config.blurRadius}px)`;
```

**Black Box**: Solid black rectangle overlay
```javascript
ctx.fillStyle = '#000000';
ctx.fillRect(x, y, width, height);
```

**Semantic**: Pattern overlay with type label
```
┌─────────┐
│[PASSWORD] (overlaid pattern)
└─────────┘
```

## Performance Metrics

Evaluation against specified criteria:

| Metric | Target | Implementation |
|--------|--------|-----------------|
| Visual Accuracy (25%) | High | DOM extraction + feature analysis |
| Sensitive Detection (20%) | 90%+ recall | Pattern matching + ML-ready |
| Redaction Precision (20%) | 95%+ | Multi-method validation |
| Client Resources (20%) | < 50MB | Lightweight models, lazy loading |
| End-to-End Latency (15%) | < 2s | Async processing, caching |

## Command Types

The agent supports these action types:

- **click**: Click at element or coordinates
- **scroll**: Scroll in direction (up/down/left/right)
- **type**: Type text into input field
- **select**: Select dropdown option
- **submit**: Submit form
- **focus**: Focus on element
- **hover**: Hover over element
- **wait**: Wait for condition or duration
- **screenshot**: Capture new screenshot
- **extract_data**: Extract data from page

Example:
```json
{
  "type": "click",
  "target": "element_id",
  "element_id": "el_12"
}
```

## Security Considerations

### Client-Side
- ✅ All vision processing happens locally
- ✅ Automatic PII detection and redaction
- ✅ No raw screenshots transmitted
- ✅ No sensitive data in metadata

### Server-Side
- ✅ Only processes anonymized content
- ✅ Validate redaction masks
- ✅ Log audit trail
- ✅ Rate limiting (future)

### Best Practices
- Only enable on trusted websites
- Regularly review privacy statistics
- Use strong redaction mode for highly sensitive data
- Deploy server in secure environment

## Development

### Debugging

Enable debug mode in popup settings to see detailed logs in browser console:

```javascript
// In content.js
Logger.log('AGENT', 'Debug message', data);
```

View server logs:
```bash
tail -f /var/log/privacy-agent/server.log
```

### Testing

Test privacy filter:
```bash
# Create test HTML with sensitive data
# Open in browser with extension
# Check redaction in popup panel
```

Test server API:
```bash
curl -X POST http://localhost:8000/api/process-screen \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

## Troubleshooting

### Extension Not Loading
- ✅ Check manifest.json syntax
- ✅ Verify file permissions
- ✅ Clear browser cache

### Server Connection Failed
- ✅ Start server: `python main.py`
- ✅ Check URL in popup settings
- ✅ Verify CORS configuration

### Low Redaction Coverage
- ✅ Increase blur radius in settings
- ✅ Try different redaction mode
- ✅ Check filter patterns in privacy-filter.js

### High Latency
- ✅ Reduce screenshot quality (popup settings)
- ✅ Increase processing interval
- ✅ Check server CPU usage

## Future Enhancements

- [ ] Multi-language support for PII patterns
- [ ] Custom redaction rules
- [ ] Offline operation mode
- [ ] OCR-based text detection
- [ ] Face detection and blurring
- [ ] Advanced VLM integration (LLaVA)
- [ ] Persistent session management
- [ ] Browser sync across devices

## Evaluation Metrics

Per problem statement, evaluating on:

1. **Accuracy of Visual Context (25%)**
   - Screen structure extraction accuracy
   - Element detection precision
   - Page understanding

2. **Sensitive Data Detection (20%)**
   - Recall: % of sensitive data found
   - Precision: % of flagged data is actually sensitive

3. **Redaction Precision (20%)**
   - Visual quality of masked regions
   - No data leakage
   - User readability maintained

4. **Client Resource Utilization (20%)**
   - Memory footprint < 50MB
   - CPU usage < 20% during processing
   - Battery impact minimized

5. **End-to-End Latency (15%)**
   - Screen capture: < 500ms
   - Local processing: < 300ms
   - Server processing: < 1000ms
   - Total: < 2s target

## Contributing

Contributions welcome! Please:
1. Fork repository
2. Create feature branch
3. Commit changes
4. Submit pull request

## License

MIT License - See LICENSE file

## Support

For issues and questions:
- Create GitHub issue
- Check documentation
- Review code comments

## Acknowledgments

Built for ISRO SIH 2026 - On-device Visual Perception for Light-weight Browser Agents
