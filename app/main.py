import psutil
import os
import logging
import base64
from typing import List
import magic
from PIL import Image
import io

from fastapi import FastAPI, Query, HTTPException, Body, status, Path, File, UploadFile, Form

from .lib.models import (
    ModelEnum, DeviceEnum, GemmaInstanceConfig, InitializeGemmaRequest, 
    ChatRequest, ImageAnalysisRequest
)

from .lib.endpoints.gemma_endpoints import (
    handle_initialize_gemma_instance,
    handle_chat_with_gemma_instance,
    handle_image_analysis,
    handle_get_instance_status,
    handle_shutdown_instance,
    handle_shutdown_all_instances
)

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

logger = logging.getLogger(__name__)

# --- FastAPI Application ---
app = FastAPI(
    title="Gemma 3n FastAPI Image Analysis API",
    description="An API for managing and interacting with Google Gemma 3n model instances for image analysis.\n\nProvides endpoints for initializing Gemma instances, analyzing images, and managing instances.",
    version="1.0.0",
    contact={
        "name": "Project Maintainers",
        "url": "https://github.com/grctest/g3n-fastapi-webcam-docker",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
)

@app.get(
    "/initialize-gemma-instance",
    summary="Initialize a Single Gemma Instance",
    tags=["Instance Management"],
    operation_id="initialize_single_gemma_instance"
)
async def initialize_gemma_instance(
    instance_id: str = Query(..., description="Unique identifier for this instance"),
    model_name: ModelEnum = Query(ModelEnum.GEMMA_3N_E2B_IT, description="Gemma model to use"),
    device: DeviceEnum = Query(DeviceEnum.AUTO, description="Device to run the model on"),
    max_length: int = Query(512, ge=1, le=8192, description="Maximum generation length"),
    temperature: float = Query(0.8, ge=0.0, le=2.0, description="Sampling temperature"),
    system_prompt: str = Query("You are a helpful AI assistant analyzing images.", description="System prompt for the model"),
    user_prompt_template: str = Query("What do you see in this image?", description="Default user prompt template"),
    load_in_4bit: bool = Query(True, description="Use 4-bit quantization for memory efficiency"),
    top_p: float = Query(0.9, ge=0.0, le=1.0, description="Top-p sampling parameter"),
    top_k: int = Query(50, ge=1, description="Top-k sampling parameter"),
    do_sample: bool = Query(True, description="Whether to use sampling")
):
    """
    Initialize and start a single Gemma model instance.

    This endpoint creates a new Gemma instance with the specified configuration.
    The instance will be loaded into memory and ready to process requests.

    **Parameters**:
    - `instance_id`: Unique identifier for this instance
    - `model_name`: The Gemma model variant to use
    - `device`: Compute device (CPU, CUDA, or auto-detect)
    - `max_length`: Maximum tokens to generate
    - `temperature`: Randomness in generation (0.0 = deterministic, 2.0 = very random)
    - `system_prompt`: Instructions for the model's behavior
    - `user_prompt_template`: Default user prompt for image analysis
    - `load_in_4bit`: Whether to use 4-bit quantization (saves memory)
    - `top_p`: Top-p sampling parameter for nucleus sampling
    - `top_k`: Top-k sampling parameter
    - `do_sample`: Whether to use sampling vs greedy decoding

    **Response**: Information about the created instance including status and memory usage.
    """
    config = GemmaInstanceConfig(
        instance_id=instance_id,
        model_name=model_name,
        device=device,
        max_length=max_length,
        temperature=temperature,
        system_prompt=system_prompt,
        user_prompt_template=user_prompt_template,
        load_in_4bit=load_in_4bit,
        top_p=top_p,
        top_k=top_k,
        do_sample=do_sample
    )
    
    request = InitializeGemmaRequest(
        config=config,
        load_in_4bit=load_in_4bit
    )
    
    return await handle_initialize_gemma_instance(request)

@app.get(
    "/chat",
    summary="Chat with a Gemma Instance",
    tags=["Interaction"],
    operation_id="chat_with_gemma_instance"
)
async def chat_with_gemma_instance(
    instance_id: str = Query(..., description="Instance ID to chat with"),
    message: str = Query(..., description="Message to send to the instance")
):
    """
    Send a text message to a Gemma instance and get a response.

    This endpoint allows you to have a conversation with a specific Gemma instance.
    The system prompt configured during initialization will influence the response style.

    **Parameters**: Chat request with instance ID and message.
    **Response**: Generated response with timing and token information.
    """
    # Convert GET parameters to ChatRequest
    from .lib.models import ChatRequest
    request = ChatRequest(
        instance_id=instance_id,
        message=message
    )
    return await handle_chat_with_gemma_instance(request)

@app.post(
    "/analyze-image",
    summary="Analyze an Image",
    tags=["Image Analysis"],
    operation_id="analyze_image_with_gemma"
)
async def analyze_image_with_gemma(request: ImageAnalysisRequest):
    """
    Analyze a base64-encoded image with a Gemma instance.

    Send an image to a Gemma instance for analysis. The model will describe
    the image based on the provided prompt.

    **Request Body**: Image data (base64), instance ID, and analysis prompt.
    **Response**: Analysis results with image metadata and timing information.
    """
    return await handle_image_analysis(request)

# Security configuration for image uploads
ALLOWED_IMAGE_TYPES = {
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'
}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_IMAGE_DIMENSION = 2048  # 2048x2048 max

def validate_image_file(file: UploadFile) -> None:
    """Validate uploaded image file for security and format compliance."""
    
    # Check file size
    if hasattr(file, 'size') and file.size > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image file too large. Maximum size: {MAX_IMAGE_SIZE // (1024*1024)}MB"
        )
    
    # Check content type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type: {file.content_type}. Allowed types: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )

def validate_image_content(file_content: bytes) -> tuple[int, int]:
    """Validate image content and return dimensions."""
    try:
        # Use python-magic to verify actual file type
        mime_type = magic.from_buffer(file_content, mime=True)
        if mime_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"File content doesn't match image type. Detected: {mime_type}"
            )
        
        # Validate image with PIL
        with Image.open(io.BytesIO(file_content)) as img:
            width, height = img.size
            
            # Check dimensions
            if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Image dimensions too large: {width}x{height}. Maximum: {MAX_IMAGE_DIMENSION}x{MAX_IMAGE_DIMENSION}"
                )
            
            return width, height
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid image file: {str(e)}"
        )

@app.post(
    "/analyze-image-multipart",
    summary="Analyze an Image (Multipart Upload)",
    tags=["Image Analysis"],
    operation_id="analyze_image_multipart_with_gemma"
)
async def analyze_image_multipart_with_gemma(
    file: UploadFile = File(..., description="Image file to analyze (JPEG, PNG, WebP, GIF)"),
    instance_id: str = Form(..., description="Gemma instance ID to process the image"),
    user_prompt: str = Form(default="What do you see in this image?", description="User prompt for image analysis")
):
    """
    Analyze an uploaded image file with a Gemma instance using multipart/form-data.
    
    This endpoint is more efficient than the base64 JSON endpoint for large images
    as it avoids the base64 encoding overhead. Includes comprehensive security validation.

    **Form Data**:
    - `file`: Image file (JPEG, PNG, WebP, GIF) - Max 10MB, Max 2048x2048
    - `instance_id`: Target Gemma instance ID
    - `user_prompt`: Custom prompt for image analysis (optional)

    **Response**: Analysis results with image metadata and timing information.
    """
    try:
        # Validate file metadata
        validate_image_file(file)
        
        # Read and validate file content
        file_content = await file.read()
        width, height = validate_image_content(file_content)
        
        logger.info(f"Processing image upload: {file.filename} ({width}x{height}, {len(file_content)} bytes) for instance {instance_id}")
        
        # Convert to base64 for compatibility with existing handler
        image_base64 = base64.b64encode(file_content).decode('utf-8')
        
        # Create ImageAnalysisRequest object with custom prompt
        from .lib.models import ImageAnalysisRequestWithPrompt
        request = ImageAnalysisRequestWithPrompt(
            instance_id=instance_id,
            image_data=image_base64,
            user_prompt=user_prompt
        )
        
        # Use existing handler (we'll need to update this to support custom prompts)
        return await handle_image_analysis(request)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Multipart image analysis failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.get(
    "/instance-status/{instance_id}",
    summary="Get Instance Status",
    tags=["Instance Management"],
    operation_id="get_gemma_instance_status"
)
async def get_gemma_instance_status(instance_id: str = Path(..., description="Instance ID to check")):
    """
    Get detailed status information for a specific Gemma instance.

    **Parameters**:
    - `instance_id`: The instance to check

    **Response**: Status, configuration, memory usage, and error information if any.
    """
    return await handle_get_instance_status(instance_id)



@app.get(
    "/shutdown-instance/{instance_id}",
    summary="Shutdown Single Instance",
    tags=["Instance Management"],
    operation_id="shutdown_gemma_instance"
)
async def shutdown_gemma_instance(instance_id: str = Path(..., description="Instance ID to shutdown")):
    """
    Shutdown a single Gemma instance to free resources.

    **Parameters**:
    - `instance_id`: The instance to shut down

    **Response**: Success message confirming shutdown.
    """
    return await handle_shutdown_instance(instance_id)

@app.get(
    "/shutdown-all-instances",
    summary="Shutdown All Instances",
    tags=["Instance Management"],
    operation_id="shutdown_all_gemma_instances"
)
async def shutdown_all_gemma_instances():
    """
    Shutdown all running Gemma instances.

    This endpoint will attempt to gracefully shut down all instances
    and free their resources.

    **Response**: Results for each instance shutdown attempt.
    """
    return await handle_shutdown_all_instances()



# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    logger.info("Gemma 3n FastAPI Image Analysis API starting up...")
    logger.info("Ready to process requests!")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Gemma 3n FastAPI Image Analysis API...")
    try:
        await handle_shutdown_all_instances()
        logger.info("All instances shut down successfully")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
