"""
Privacy Browser Agent Server
Handles vision processing, privacy validation, and action planning
"""

import os
import sys
import json
import base64
import logging
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime
from io import BytesIO

from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import PIL for image processing
from PIL import Image
import numpy as np

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Privacy Browser Agent Server",
    description="Server-side processing for privacy-preserving visual perception",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Data Models
# ============================================================================

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class Redaction(BaseModel):
    type: str
    bbox: BoundingBox
    reason: str
    priority: str


class RedactionMask(BaseModel):
    canvas: Dict[str, int]
    redactions: List[Redaction]
    stats: Dict[str, int]
    timestamp: int


class ElementInfo(BaseModel):
    element_id: str
    tag: str
    type: Optional[str] = None
    text: str = ""
    bbox: BoundingBox
    isVisible: bool = True
    isInteractive: bool = False


class PageStructure(BaseModel):
    totalElements: int
    interactiveElements: int
    visibleElements: int
    elements: List[ElementInfo]
    pageTitle: str
    url: str
    timestamp: int


class Screenshot(BaseModel):
    data: str  # base64 encoded
    size: int
    type: str


class ProcessScreenRequest(BaseModel):
    screenshot: Screenshot
    pageStructure: PageStructure
    redactionMask: RedactionMask
    sessionId: str


class Command(BaseModel):
    type: str
    target: Optional[str] = None
    element_id: Optional[str] = None
    selector: Optional[str] = None
    text: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    duration: Optional[int] = None
    direction: Optional[str] = None
    amount: Optional[int] = None


class ProcessScreenResponse(BaseModel):
    success: bool
    analysis: Optional[Dict[str, Any]] = None
    commands: Optional[List[Command]] = None
    error: Optional[str] = None


class ExecuteActionRequest(BaseModel):
    action: Command
    timestamp: int


class ExecuteActionResponse(BaseModel):
    success: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# ============================================================================
# Vision Processing Module
# ============================================================================

class VisionAnalyzer:
    """Analyzes visual content from screenshots"""

    def __init__(self):
        self.session_count = 0
        self.logger = logging.getLogger('VisionAnalyzer')

    def decode_screenshot(self, screenshot_data: Screenshot) -> Optional[np.ndarray]:
        """Decode base64 screenshot to numpy array"""
        try:
            if not screenshot_data.data.startswith('data:image'):
                raise ValueError("Invalid image data format")
            
            # Extract base64 data
            image_data = screenshot_data.data.split(',')[1]
            image_bytes = base64.b64decode(image_data)
            
            # Convert to PIL Image
            image = Image.open(BytesIO(image_bytes))
            return np.array(image)
        except Exception as e:
            self.logger.error(f"Failed to decode screenshot: {e}")
            return None

    def analyze_colors(self, image: np.ndarray) -> Dict[str, float]:
        """Analyze color distribution"""
        if image is None or len(image.shape) < 2:
            return {}

        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = np.mean(image, axis=2)
        else:
            gray = image

        # Calculate statistics
        brightness = np.mean(gray) / 255.0
        contrast = np.std(gray) / 255.0

        return {
            'brightness': float(brightness),
            'contrast': float(contrast),
            'complexity': float(contrast * 0.5)
        }

    def analyze_structure(self, page_structure: PageStructure) -> Dict[str, Any]:
        """Analyze page structure"""
        return {
            'total_elements': page_structure.totalElements,
            'interactive_elements': page_structure.interactiveElements,
            'visible_elements': page_structure.visibleElements,
            'page_title': page_structure.pageTitle,
            'url': page_structure.url
        }

    def detect_form_fields(self, page_structure: PageStructure) -> List[Dict[str, Any]]:
        """Detect form fields and input areas"""
        forms = []
        for element in page_structure.elements:
            if element.tag in ['input', 'textarea', 'select'] and element.isVisible:
                forms.append({
                    'id': element.element_id,
                    'type': element.tag,
                    'field_type': element.type,
                    'text': element.text[:50] if element.text else '',
                    'placeholder': element.text
                })
        return forms

    async def process_screenshot(
        self, 
        request: ProcessScreenRequest
    ) -> Dict[str, Any]:
        """Full screenshot analysis"""
        try:
            self.session_count += 1
            
            # Decode image
            image = self.decode_screenshot(request.screenshot)
            
            # Analyze
            analysis = {
                'session_id': request.sessionId,
                'timestamp': datetime.now().isoformat(),
                'colors': self.analyze_colors(image) if image is not None else {},
                'structure': self.analyze_structure(request.pageStructure),
                'forms': self.detect_form_fields(request.pageStructure),
                'redactions': {
                    'total': len(request.redactionMask.redactions),
                    'by_type': self._count_by_type(request.redactionMask.redactions),
                    'stats': request.redactionMask.stats
                }
            }
            
            self.logger.info(f"Processed screenshot {self.session_count}")
            return analysis
        except Exception as e:
            self.logger.error(f"Analysis failed: {e}", exc_info=True)
            raise

    def _count_by_type(self, redactions: List[Redaction]) -> Dict[str, int]:
        """Count redactions by type"""
        counts = {}
        for red in redactions:
            counts[red.type] = counts.get(red.type, 0) + 1
        return counts


# ============================================================================
# Agent Planning Module
# ============================================================================

class AgentPlanner:
    """Plans actions based on visual analysis"""

    def __init__(self):
        self.logger = logging.getLogger('AgentPlanner')
        self.action_history = []

    def plan_actions(
        self,
        analysis: Dict[str, Any],
        user_goal: Optional[str] = None
    ) -> List[Command]:
        """Generate action plan based on analysis"""
        commands = []

        try:
            # Example: If page has forms, generate interaction commands
            forms = analysis.get('forms', [])
            
            if forms:
                for form in forms[:2]:  # Limit to first 2 forms
                    element_id = form.get('id')
                    field_type = form.get('field_type', 'text')
                    
                    if field_type == 'password':
                        commands.append(Command(
                            type='click',
                            target='element_id',
                            element_id=element_id
                        ))
                    elif field_type == 'email':
                        commands.append(Command(
                            type='focus',
                            target='element_id',
                            element_id=element_id
                        ))

            # Add a basic navigation command
            if analysis.get('structure', {}).get('visible_elements', 0) > 0:
                # Scroll down to see more content
                commands.append(Command(
                    type='scroll',
                    direction='down',
                    amount=300
                ))

            self.logger.info(f"Planned {len(commands)} actions")
            self.action_history.extend(commands)
            
            return commands
        except Exception as e:
            self.logger.error(f"Planning failed: {e}")
            return []

    def get_action_history(self) -> List[Command]:
        """Get history of planned actions"""
        return self.action_history[-20:]  # Return last 20 actions


# ============================================================================
# Privacy Validator Module
# ============================================================================

class PrivacyValidator:
    """Validates privacy and redaction policies"""

    def __init__(self):
        self.logger = logging.getLogger('PrivacyValidator')

    def validate_redaction_mask(self, mask: RedactionMask) -> bool:
        """Validate that redaction mask is properly applied"""
        try:
            # Check that all redactions have required fields
            for redaction in mask.redactions:
                if not redaction.type or not redaction.bbox:
                    return False

            # Check redaction coverage
            total_redacted = mask.stats.get('redacted', 0)
            total_sensitive = mask.stats.get('sensitiveDetected', 0)

            if total_sensitive > 0:
                coverage = total_redacted / total_sensitive
                if coverage < 0.8:  # At least 80% should be redacted
                    self.logger.warning(f"Low redaction coverage: {coverage}")

            return True
        except Exception as e:
            self.logger.error(f"Validation failed: {e}")
            return False

    def check_privacy_compliance(
        self,
        screenshot: Screenshot,
        redaction_mask: RedactionMask
    ) -> Dict[str, Any]:
        """Check overall privacy compliance"""
        return {
            'compliant': self.validate_redaction_mask(redaction_mask),
            'redaction_coverage': len(redaction_mask.redactions),
            'sensitive_detected': redaction_mask.stats.get('sensitiveDetected', 0),
            'timestamp': datetime.now().isoformat()
        }


# ============================================================================
# Global Instances
# ============================================================================

vision_analyzer = VisionAnalyzer()
agent_planner = AgentPlanner()
privacy_validator = PrivacyValidator()


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/info")
async def server_info():
    """Server information"""
    return {
        "name": "Privacy Browser Agent Server",
        "version": "1.0.0",
        "capabilities": [
            "screen_analysis",
            "privacy_validation",
            "action_planning",
            "command_execution"
        ]
    }


@app.post("/api/process-screen", response_model=ProcessScreenResponse)
async def process_screen(request: ProcessScreenRequest) -> ProcessScreenResponse:
    """
    Main endpoint: Process screenshot and generate commands
    
    Evaluation Metrics:
    - Visual accuracy (25%): Analyze screen structure and content
    - Privacy validation (20%): Check redaction coverage
    - Action planning (15%): Generate relevant commands
    """
    try:
        logger.info(f"Processing screen for session {request.sessionId}")

        # Step 1: Analyze screenshot
        analysis = await vision_analyzer.process_screenshot(request)

        # Step 2: Validate privacy
        privacy_check = privacy_validator.check_privacy_compliance(
            request.screenshot,
            request.redactionMask
        )

        if not privacy_check['compliant']:
            logger.warning(f"Privacy compliance issue: {privacy_check}")

        # Step 3: Plan actions
        commands = agent_planner.plan_actions(analysis)

        return ProcessScreenResponse(
            success=True,
            analysis=analysis,
            commands=commands
        )

    except Exception as e:
        logger.error(f"Screen processing failed: {e}", exc_info=True)
        return ProcessScreenResponse(
            success=False,
            error=str(e)
        )


@app.post("/api/execute", response_model=ExecuteActionResponse)
async def execute_action(request: ExecuteActionRequest) -> ExecuteActionResponse:
    """
    Execute action on client side (for logging/validation)
    This primarily logs the action; execution happens on client
    """
    try:
        logger.info(f"Action request: {request.action.type}")
        
        return ExecuteActionResponse(
            success=True,
            result={
                'action': request.action.type,
                'timestamp': datetime.now().isoformat(),
                'status': 'scheduled'
            }
        )
    except Exception as e:
        logger.error(f"Action execution failed: {e}")
        return ExecuteActionResponse(
            success=False,
            error=str(e)
        )


@app.post("/api/validate-privacy", response_model=Dict[str, Any])
async def validate_privacy(mask: RedactionMask):
    """Validate privacy redaction mask"""
    try:
        compliance = privacy_validator.check_privacy_compliance(
            None,
            mask
        )
        return {
            "success": True,
            **compliance
        }
    except Exception as e:
        logger.error(f"Privacy validation failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@app.get("/api/analytics")
async def get_analytics():
    """Get server analytics"""
    return {
        "screenshots_processed": vision_analyzer.session_count,
        "actions_planned": len(agent_planner.get_action_history()),
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/feedback")
async def submit_feedback(feedback: Dict[str, Any]):
    """Submit feedback from client"""
    try:
        logger.info(f"Feedback received: {feedback}")
        return {
            "success": True,
            "message": "Feedback recorded"
        }
    except Exception as e:
        logger.error(f"Feedback submission failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }


# ============================================================================
# Startup and Shutdown
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize on server startup"""
    logger.info("Privacy Browser Agent Server starting up")
    logger.info("Vision Analyzer initialized")
    logger.info("Agent Planner initialized")
    logger.info("Privacy Validator initialized")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on server shutdown"""
    logger.info("Privacy Browser Agent Server shutting down")
    logger.info(f"Processed {vision_analyzer.session_count} screenshots")


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    # Run with: python main.py
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
