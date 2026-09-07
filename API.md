# API Documentation

## Base URL
```
http://localhost:8000
```

## Authentication
Currently no authentication required. In production, implement JWT or OAuth2.

---

## Health & Info Endpoints

### Health Check
Check server status and availability.

**Request:**
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.123456"
}
```

**Status Codes:**
- `200 OK` - Server is healthy
- `503 Service Unavailable` - Server is down

---

### Server Info
Get server capabilities and version information.

**Request:**
```http
GET /api/info
```

**Response:**
```json
{
  "name": "Privacy Browser Agent Server",
  "version": "1.0.0",
  "capabilities": [
    "screen_analysis",
    "privacy_validation",
    "action_planning",
    "command_execution"
  ]
}
```

---

## Core Processing Endpoints

### Process Screenshot
Main endpoint for screen processing and command generation.

**Evaluation Metrics Addressed:**
- Visual accuracy (25%)
- Privacy detection (20%)
- Redaction precision (20%)
- Latency (15%)

**Request:**
```http
POST /api/process-screen
Content-Type: application/json
X-Request-ID: request-123
```

**Request Body:**
```json
{
  "screenshot": {
    "data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...",
    "size": 45823,
    "type": "image/jpeg"
  },
  "pageStructure": {
    "totalElements": 156,
    "interactiveElements": 42,
    "visibleElements": 138,
    "elements": [
      {
        "element_id": "el_0",
        "tag": "button",
        "type": "submit",
        "text": "Login",
        "bbox": {
          "x": 120,
          "y": 300,
          "width": 80,
          "height": 40
        },
        "isVisible": true,
        "isInteractive": true
      }
    ],
    "pageTitle": "Login - Example.com",
    "url": "https://example.com/login",
    "timestamp": 1705318200000
  },
  "redactionMask": {
    "canvas": {
      "width": 1280,
      "height": 720
    },
    "redactions": [
      {
        "type": "password",
        "bbox": {
          "x": 150,
          "y": 250,
          "width": 300,
          "height": 40
        },
        "reason": "password_field_filled",
        "priority": "critical"
      },
      {
        "type": "email",
        "bbox": {
          "x": 180,
          "y": 180,
          "width": 250,
          "height": 35
        },
        "reason": "pii_email",
        "priority": "high"
      }
    ],
    "stats": {
      "totalElements": 156,
      "sensitiveDetected": 8,
      "redacted": 7
    },
    "timestamp": 1705318200000
  },
  "sessionId": "session_1705318200000_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "session_id": "session_1705318200000_abc123",
    "timestamp": "2024-01-15T10:30:00.123456",
    "colors": {
      "brightness": 0.75,
      "contrast": 0.45,
      "complexity": 0.22
    },
    "structure": {
      "total_elements": 156,
      "interactive_elements": 42,
      "visible_elements": 138,
      "page_title": "Login - Example.com",
      "url": "https://example.com/login"
    },
    "forms": [
      {
        "id": "el_5",
        "type": "input",
        "field_type": "email",
        "text": "user@example.com",
        "placeholder": "Email address"
      },
      {
        "id": "el_6",
        "type": "input",
        "field_type": "password",
        "text": "••••••••",
        "placeholder": "Password"
      }
    ],
    "redactions": {
      "total": 7,
      "by_type": {
        "password": 1,
        "email": 1,
        "credit_card": 0,
        "ssn": 0,
        "phone": 0
      },
      "stats": {
        "sensitiveDetected": 8,
        "redacted": 7
      }
    }
  },
  "commands": [
    {
      "type": "click",
      "target": "element_id",
      "element_id": "el_0"
    },
    {
      "type": "scroll",
      "direction": "down",
      "amount": 300
    }
  ]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether processing succeeded |
| `analysis` | object | Detailed visual analysis |
| `commands` | array | Action commands to execute |
| `error` | string | Error message if failed |

**Status Codes:**
- `200 OK` - Processing successful
- `400 Bad Request` - Invalid request format
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - Server error

**Performance:**
- Expected latency: < 1000ms
- Screenshot size: 40-80KB (JPEG)
- Response size: 50-150KB

---

### Execute Action
Log and validate action execution.

**Request:**
```http
POST /api/execute
Content-Type: application/json
```

**Request Body:**
```json
{
  "action": {
    "type": "click",
    "target": "element_id",
    "element_id": "el_12"
  },
  "timestamp": 1705318200000
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "action": "click",
    "timestamp": "2024-01-15T10:30:00.123456",
    "status": "scheduled"
  }
}
```

---

## Privacy & Validation Endpoints

### Validate Privacy Mask
Validate redaction mask compliance and coverage.

**Request:**
```http
POST /api/validate-privacy
Content-Type: application/json
```

**Request Body:**
```json
{
  "canvas": {
    "width": 1280,
    "height": 720
  },
  "redactions": [
    {
      "type": "password",
      "bbox": {
        "x": 150,
        "y": 250,
        "width": 300,
        "height": 40
      },
      "reason": "password_field",
      "priority": "critical"
    }
  ],
  "stats": {
    "sensitiveDetected": 5,
    "redacted": 5
  },
  "timestamp": 1705318200000
}
```

**Response:**
```json
{
  "success": true,
  "compliant": true,
  "redaction_coverage": 5,
  "sensitive_detected": 5,
  "timestamp": "2024-01-15T10:30:00.123456"
}
```

**Compliance Criteria:**
- Redaction coverage ≥ 80% of detected sensitive elements
- All redaction types properly classified
- Bounding boxes within canvas bounds

---

## Analytics & Monitoring Endpoints

### Get Analytics
Retrieve server analytics and statistics.

**Request:**
```http
GET /api/analytics
```

**Response:**
```json
{
  "screenshots_processed": 150,
  "actions_planned": 45,
  "timestamp": "2024-01-15T10:30:00.123456"
}
```

**Metrics:**
| Metric | Description |
|--------|-------------|
| `screenshots_processed` | Total screenshots processed |
| `actions_planned` | Total actions planned |
| `avg_processing_time` | Average processing latency |
| `error_rate` | Percentage of failed requests |

---

### Submit Feedback
Submit feedback and telemetry from client.

**Request:**
```http
POST /api/feedback
Content-Type: application/json
```

**Request Body:**
```json
{
  "session_id": "session_1705318200000_abc123",
  "latency": 850,
  "redaction_quality": 0.92,
  "command_success_rate": 0.95,
  "issues": [
    "password_field_missed",
    "high_latency_on_scroll"
  ],
  "feedback": "Good overall performance, detected most sensitive fields"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Feedback recorded"
}
```

---

## Command Types

### Available Commands

#### Click
Click on element at given location.

```json
{
  "type": "click",
  "target": "element_id",
  "element_id": "el_12"
}
```

Options:
- `target`: "element_id" | "selector" | "coordinates" | "xpath"
- `element_id`: Element identifier
- `selector`: CSS selector
- `x`, `y`: Pixel coordinates

#### Scroll
Scroll page in specified direction.

```json
{
  "type": "scroll",
  "direction": "down",
  "amount": 300,
  "smooth": true
}
```

Options:
- `direction`: "up" | "down" | "left" | "right"
- `amount`: Pixels to scroll (default: 300)
- `smooth`: Smooth animation (default: true)

#### Type
Type text into input field.

```json
{
  "type": "type",
  "target": "element_id",
  "element_id": "el_5",
  "text": "user@example.com",
  "delay": 50
}
```

Options:
- `text`: Text to type
- `delay`: Delay between characters (ms)

#### Select
Select dropdown option.

```json
{
  "type": "select",
  "target": "element_id",
  "element_id": "el_8",
  "value": "option_value"
}
```

Options:
- `value`: Option value to select
- `label`: Option label to match

#### Submit
Submit form.

```json
{
  "type": "submit",
  "target": "form"
}
```

#### Focus
Focus on element.

```json
{
  "type": "focus",
  "target": "element_id",
  "element_id": "el_5"
}
```

#### Hover
Hover over element.

```json
{
  "type": "hover",
  "target": "element_id",
  "element_id": "el_3"
}
```

#### Wait
Wait for condition or duration.

```json
{
  "type": "wait",
  "duration": 1000
}
```

Options:
- `duration`: Milliseconds to wait
- `condition`: "page_load" (wait for page load)

#### Screenshot
Capture new screenshot.

```json
{
  "type": "screenshot"
}
```

#### Extract Data
Extract data from page elements.

```json
{
  "type": "extract_data",
  "selector": "#form-data"
}
```

Options:
- `selector`: CSS selector to extract from
- `attribute`: HTML attribute to extract (optional)

---

## Error Responses

### Bad Request
```json
{
  "detail": [
    {
      "loc": ["body", "screenshot", "data"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```
Status: `422 Unprocessable Entity`

### Server Error
```json
{
  "success": false,
  "error": "Screenshot processing failed: Invalid image data"
}
```
Status: `500 Internal Server Error`

---

## Rate Limiting

Currently no rate limits. In production, implement:

```
- 30 requests/minute per IP
- 1000 requests/hour per API key
- 10MB max request size
- 60s request timeout
```

---

## Request Headers

Recommended headers for all requests:

```http
Content-Type: application/json
X-Request-ID: unique-request-id
X-API-Version: 1.0
Accept: application/json
```

---

## Response Headers

Server returns:

```http
Content-Type: application/json
X-Processing-Time: 850ms
X-Request-ID: unique-request-id
Cache-Control: no-cache, no-store
```

---

## Example Workflows

### 1. Full Processing Cycle

```python
import requests

# 1. Capture screenshot (done by extension)
# 2. Send to server
response = requests.post(
    'http://localhost:8000/api/process-screen',
    json={...}
)

# 3. Parse response
if response.status_code == 200:
    data = response.json()
    commands = data['commands']
    
    # 4. Execute each command
    for cmd in commands:
        requests.post(
            'http://localhost:8000/api/execute',
            json={'action': cmd}
        )
```

### 2. Privacy Validation

```python
# Validate redaction mask before transmission
response = requests.post(
    'http://localhost:8000/api/validate-privacy',
    json=redaction_mask
)

if response.json()['compliant']:
    # Safe to transmit
    transmit_screenshot()
```

---

## OpenAPI/Swagger

API documentation available at:
```
http://localhost:8000/docs
http://localhost:8000/redoc
```

Interactive API testing available through Swagger UI.
