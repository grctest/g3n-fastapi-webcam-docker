from enum import Enum
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field
import base64

class ModelEnum(str, Enum):
    """Enumeration of available Gemma models."""
    GEMMA_3N_E2B_IT = "google/gemma-3n-E2B-it"

class DeviceEnum(str, Enum):
    """Enumeration of compute devices."""
    CPU = "cpu"
    CUDA = "cuda"
    AUTO = "auto"

# --- Base Request/Response Models ---

class BaseGemmaConfig(BaseModel):
    """Base configuration for Gemma instances."""
    model_name: ModelEnum = Field(default=ModelEnum.GEMMA_3N_E2B_IT, description="The Gemma model to use")
    device: DeviceEnum = Field(default=DeviceEnum.AUTO, description="Device to run the model on")
    max_length: int = Field(default=100, ge=1, le=8192, description="Maximum generation length")
    do_sample: bool = Field(default=True, description="Whether to use sampling")

class GemmaInstanceConfig(BaseGemmaConfig):
    """Configuration for a Gemma instance."""
    instance_id: str = Field(..., description="Unique identifier for this instance")
    system_prompt: str = Field(default="You are a helpful AI assistant analyzing images.", description="System prompt for the model")
    user_prompt_template: str = Field(default="What do you see in this image?", description="Default user prompt template")

# --- Request Models ---

class InitializeGemmaRequest(BaseModel):
    """Request to initialize a Gemma instance."""
    config: GemmaInstanceConfig
    trust_remote_code: bool = Field(default=True, description="Trust remote code for model loading")

class ChatRequest(BaseModel):
    """Request for chat with a Gemma instance."""
    instance_id: str = Field(..., description="Target Gemma instance ID")
    message: str = Field(..., description="User message/prompt")

class ImageAnalysisRequest(BaseModel):
    """Request for image analysis."""
    instance_id: str = Field(..., description="Target Gemma instance ID")
    image_data: str = Field(..., description="Base64 encoded image data")

class ImageAnalysisRequestWithPrompt(BaseModel):
    """Request for image analysis with custom user prompt."""
    instance_id: str = Field(..., description="Target Gemma instance ID")
    image_data: str = Field(..., description="Base64 encoded image data")
    user_prompt: str = Field(default="What do you see in this image?", description="Custom user prompt for analysis")

# --- Response Models ---

class GemmaInstanceInfo(BaseModel):
    """Information about a Gemma instance."""
    instance_id: str
    config: GemmaInstanceConfig
    status: str  # "running", "loading", "error", "stopped"
    memory_usage_mb: Optional[float] = None
    device_info: Optional[str] = None
    created_at: str
    error_message: Optional[str] = None

class ChatResponse(BaseModel):
    """Response from a chat request."""
    instance_id: str
    prompt: str
    response: str
    generation_time_seconds: float
    token_count: Optional[int] = None
    truncated: bool = False

class ImageAnalysisResponse(BaseModel):
    """Response from image analysis."""
    instance_id: str
    prompt: str
    response: str
    generation_time_seconds: float
    image_dimensions: tuple[int, int]
    token_count: Optional[int] = None
    truncated: bool = False

class InstanceStatusResponse(BaseModel):
    """Response with instance status information."""
    instance_id: str
    status: str
    config: Optional[GemmaInstanceConfig] = None
    memory_usage_mb: Optional[float] = None
    device_info: Optional[str] = None
    actual_device: Optional[str] = None  # The actual device being used (after fallbacks)
    uptime_seconds: Optional[float] = None
    error_message: Optional[str] = None
    ready: bool = False  # Whether the instance is fully loaded and ready

class SystemStatusResponse(BaseModel):
    """System-wide status response."""
    total_instances: int
    running_instances: int
    total_memory_usage_mb: float
    available_memory_gb: float
    gpu_available: bool
    gpu_memory_usage_mb: Optional[float] = None
    cpu_threads: int
    instances: List[InstanceStatusResponse]

# --- Utility Models ---

class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    detail: str
    instance_id: Optional[str] = None
    timestamp: str

class HealthCheckResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    uptime_seconds: float
    total_instances: int
    healthy_instances: int