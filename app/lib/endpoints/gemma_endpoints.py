import asyncio
import time
from typing import List, Dict, Any
import logging
import torch
from fastapi import HTTPException, status

from ..models import (
    InitializeGemmaRequest, ChatRequest, 
    ImageAnalysisRequest, ImageAnalysisRequestWithPrompt,
    GemmaInstanceInfo,
    ChatResponse, ImageAnalysisResponse,
    SystemStatusResponse, InstanceStatusResponse
)
from ..gemma_manager import gemma_manager

logger = logging.getLogger(__name__)

async def handle_initialize_gemma_instance(request: InitializeGemmaRequest) -> GemmaInstanceInfo:
    """Initialize a single Gemma instance."""
    try:
        return await gemma_manager.initialize_instance(
            request.config, 
            request.trust_remote_code
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to initialize Gemma instance: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

async def handle_chat_with_gemma_instance(request: ChatRequest) -> ChatResponse:
    """Handle chat with a Gemma instance."""
    try:
        return await gemma_manager.chat(
            request.instance_id,
            request.message
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

async def handle_image_analysis(request) -> ImageAnalysisResponse:
    """Handle image analysis request with optional custom prompt."""
    try:
        # Support both old and new request formats
        if hasattr(request, 'user_prompt'):
            # New format with custom prompt
            user_prompt = request.user_prompt
        else:
            # Old format, use default
            user_prompt = "Describe what you see in this image."
            
        return await gemma_manager.analyze_image(
            request.instance_id,
            request.image_data,
            user_prompt
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Image analysis failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

async def handle_image_analysis_from_file(instance_id: str, image, user_prompt: str) -> ImageAnalysisResponse:
    """Handle image analysis from PIL Image object (like Kaggle example)."""
    try:
        return await gemma_manager.analyze_image_from_pil(
            instance_id,
            image,
            user_prompt
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Image analysis from file failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

async def handle_get_instance_status(instance_id: str) -> InstanceStatusResponse:
    """Get status of a specific instance."""
    try:
        info = gemma_manager.get_instance_info(instance_id)
        instance = gemma_manager.get_instance(instance_id)
        
        return InstanceStatusResponse(
            instance_id=info.instance_id,
            status=info.status,
            config=info.config,
            memory_usage_mb=info.memory_usage_mb,
            device_info=info.device_info,
            actual_device=instance.get_actual_device(),
            uptime_seconds=None,  # TODO: Calculate uptime
            error_message=info.error_message,
            ready=instance.is_ready()  # Add readiness flag
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

async def handle_get_system_status() -> SystemStatusResponse:
    """Get system-wide status."""
    try:
        status_data = gemma_manager.get_system_status()
        return SystemStatusResponse(**status_data)
    except Exception as e:
        logger.error(f"Failed to get system status: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

async def handle_shutdown_instance(instance_id: str):
    """Shutdown a single instance."""
    try:
        await gemma_manager.shutdown_instance(instance_id)
        return {"message": f"Instance {instance_id} shut down successfully"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to shutdown instance {instance_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

async def handle_shutdown_all_instances():
    """Shutdown all instances."""
    try:
        instance_ids = [info.instance_id for info in gemma_manager.list_instances()]
        if not instance_ids:
            return {"message": "No instances to shutdown", "count": 0}
        
        for instance_id in instance_ids:
            try:
                await gemma_manager.shutdown_instance(instance_id)
            except Exception as e:
                logger.error(f"Error shutting down instance {instance_id}: {e}")
        
        return {"message": f"Shutdown {len(instance_ids)} instances", "count": len(instance_ids)}
        
    except Exception as e:
        logger.error(f"Failed to shutdown all instances: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

async def handle_cancel_instance_processing(instance_id: str):
    """Cancel ongoing processing for an instance."""
    try:
        cancelled = gemma_manager.cancel_instance_processing(instance_id)
        if cancelled:
            return {"message": f"Processing cancellation requested for instance {instance_id}", "cancelled": True}
        else:
            return {"message": f"Instance {instance_id} is not currently processing", "cancelled": False}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to cancel processing for instance {instance_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

async def handle_analyze_image_from_pil(image, instance_id: str, user_prompt: str = "What do you see in this image?"):
    """Handle PIL image analysis following HuggingFace docs exactly."""
    try:
        return await gemma_manager.analyze_image_from_pil(instance_id, image, user_prompt)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"PIL Image analysis failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

async def handle_get_device_capabilities():
    """Get device capabilities including CUDA availability and bfloat16 support."""
    try:
        cuda_available = torch.cuda.is_available()
        cuda_compatible = False
        cuda_capability = None
        bfloat16_supported = False
        incompatibility_reason = None
        
        capabilities = {
            "cuda_available": cuda_available,
            "cpu_available": True,  # CPU is always available
        }
        
        if cuda_available and torch.cuda.device_count() > 0:
            # Get CUDA capability for compatibility checks
            cuda_capability = torch.cuda.get_device_capability()
            major, minor = cuda_capability
            capability_version = major + (minor / 10)  # e.g., 6.1 -> 6.1, 8.0 -> 8.0
            
            # Check if CUDA capability is >= 7.0 (required for triton GPU compiler)
            # GTX 1060 has capability 6.1, which causes triton compiler errors
            cuda_compatible = capability_version >= 7.0
            
            # Check bfloat16 support (requires CUDA capability >= 8.0)
            # Capability 8.0+ provides native bfloat16 for optimal performance
            bfloat16_supported = capability_version >= 8.0
            
            device_name = torch.cuda.get_device_name()
            
            if not cuda_compatible:
                incompatibility_reason = f"CUDA capability {major}.{minor} is too old. Requires >= 7.0 for triton GPU compiler support."
            elif not bfloat16_supported:
                incompatibility_reason = f"CUDA capability {major}.{minor} does not support native bfloat16. Requires >= 8.0 for optimal performance."
            
            capabilities.update({
                "cuda_device_count": torch.cuda.device_count(),
                "cuda_device_name": device_name,
                "cuda_memory_gb": torch.cuda.get_device_properties(0).total_memory / 1024**3,
                "cuda_capability": f"{major}.{minor}",
                "cuda_compatible": cuda_compatible,
                "bfloat16_supported": bfloat16_supported,
                "incompatibility_reason": incompatibility_reason
            })
        
        # Determine recommended device based on compatibility
        if cuda_available and cuda_compatible:
            recommended_device = "cuda"
        else:
            recommended_device = "cpu"
            if cuda_available and not cuda_compatible:
                logger.warning(f"CUDA is available but incompatible: {incompatibility_reason}")
        
        capabilities["recommended_device"] = recommended_device
            
        logger.info(f"Device capabilities: {capabilities}")
        return capabilities
        
    except Exception as e:
        logger.error(f"Failed to get device capabilities: {e}")
        # Return safe defaults on error
        return {
            "cuda_available": False,
            "cpu_available": True,
            "recommended_device": "cpu",
            "cuda_compatible": False,
            "bfloat16_supported": False,
            "incompatibility_reason": "Failed to check device capabilities"
        }
