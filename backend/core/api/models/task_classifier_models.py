"""
Pydantic models for Task Complexity Classification API (Story 3.1).
"""

from pydantic import BaseModel, Field


class ClassificationRequest(BaseModel):
    """Request model for task classification."""
    task: str = Field(..., description="Task text to classify", min_length=1, max_length=50000)
    
    class Config:
        json_schema_extra = {
            "example": {
                "task": "What is Python?"
            }
        }


class ClassificationResponse(BaseModel):
    """Response model for task classification."""
    complexity: str = Field(..., description="Complexity level: simple, medium, complex, or very_complex")
    confidence: float = Field(..., description="Confidence score (0.0-1.0)", ge=0.0, le=1.0)
    task: str = Field(..., description="Original task text")
    metadata: dict = Field(..., description="Classification metadata")
    timestamp: str = Field(..., description="Classification timestamp (ISO format)")

