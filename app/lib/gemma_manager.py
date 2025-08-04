import os
import time
import asyncio
import threading
from typing import Dict, Optional, List, Any
import logging
from datetime import datetime
import base64
import io
from concurrent.futures import ThreadPoolExecutor

import torch
from transformers import AutoProcessor, Gemma3nForConditionalGeneration
import psutil
from PIL import Image
import numpy as np

from .models import (
    GemmaInstanceConfig, GemmaInstanceInfo, ChatResponse, 
    ImageAnalysisResponse, DeviceEnum,
    ErrorResponse
)

logger = logging.getLogger(__name__)

class GemmaInstance:
    """Represents a single Gemma model instance."""
    
    def __init__(self, config: GemmaInstanceConfig, trust_remote_code: bool = True):
        self.config = config
        self.instance_id = config.instance_id
        self.status = "loading"
        self.created_at = datetime.now().isoformat()
        self.model = None
        self.processor = None
        self.device = None
        self.memory_usage_mb = 0.0
        self.error_message = None
        self.trust_remote_code = trust_remote_code
        self._lock = threading.Lock()
        self._processing = False  # Flag to track if currently processing
        self._cancel_processing = False  # Flag to request cancellation
        
    async def initialize(self):
        """Initialize the model and tokenizer."""
        try:
            logger.info(f"Initializing Gemma instance {self.instance_id}")
            
            # Check if local model exists
            local_model_path = os.path.join("app", "models", "google", "gemma-3n-E2B-it")
            if not os.path.exists(local_model_path):
                error_msg = f"Local model not found at {local_model_path}. Please ensure the model is downloaded first."
                logger.error(error_msg)
                self.status = "error"
                self.error_message = error_msg
                raise FileNotFoundError(error_msg)
            
            # Verify essential model files exist
            required_files = ["config.json", "model.safetensors.index.json"]
            missing_files = []
            for file in required_files:
                if not os.path.exists(os.path.join(local_model_path, file)):
                    missing_files.append(file)
            
            if missing_files:
                error_msg = f"Missing required model files in {local_model_path}: {missing_files}"
                logger.error(error_msg)
                self.status = "error"
                self.error_message = error_msg
                raise FileNotFoundError(error_msg)
            
            logger.info(f"Using local model from {local_model_path}")
            
            # Determine device
            if self.config.device == DeviceEnum.AUTO:
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
            else:
                self.device = self.config.device.value
            
            # Log device information and store device details
            logger.info(f"Target device: {self.device}")
            if self.device == "cuda":
                if torch.cuda.is_available():
                    logger.info(f"CUDA is available. Device count: {torch.cuda.device_count()}")
                    logger.info(f"Current CUDA device: {torch.cuda.current_device()}")
                    logger.info(f"Device name: {torch.cuda.get_device_name()}")
                    logger.info(f"Device memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
                    self.actual_device = "cuda"
                    self.device_details = {
                        "type": "cuda",
                        "name": torch.cuda.get_device_name(),
                        "memory_gb": torch.cuda.get_device_properties(0).total_memory / 1024**3,
                        "device_count": torch.cuda.device_count()
                    }
                else:
                    logger.warning("CUDA selected but not available! Falling back to CPU")
                    self.device = "cpu"
                    self.actual_device = "cpu"
                    self.device_details = {
                        "type": "cpu",
                        "fallback_from": "cuda",
                        "cores": psutil.cpu_count(),
                        "memory_gb": psutil.virtual_memory().total / 1024**3
                    }
            else:
                self.actual_device = "cpu"
                self.device_details = {
                    "type": "cpu",
                    "cores": psutil.cpu_count(),
                    "memory_gb": psutil.virtual_memory().total / 1024**3
                }
            
            # Load processor from local path
            logger.info(f"Loading processor from {local_model_path}")
            
            self.processor = AutoProcessor.from_pretrained(
                local_model_path,
                trust_remote_code=self.trust_remote_code,
                local_files_only=True
            )
            
            # Load model from local path with optimized settings
            logger.info(f"Loading Gemma 3n model from {local_model_path} on device {self.device}")
            
            if self.device == "cuda":
                # GPU loading with bfloat16 precision
                logger.info("Using CUDA with bfloat16 precision")
                self.model = Gemma3nForConditionalGeneration.from_pretrained(
                    local_model_path,
                    torch_dtype=torch.bfloat16,
                    trust_remote_code=self.trust_remote_code,
                    local_files_only=True
                ).eval()
                
                # Move model to GPU device
                self.model = self.model.to(self.device)
                
                # Log successful GPU loading
                logger.info(f"Model loaded on GPU. Device: {next(self.model.parameters()).device}")
                logger.info(f"Model dtype: {next(self.model.parameters()).dtype}")
                
            else:
                # CPU loading with memory optimizations
                logger.info("Using CPU with optimized memory settings")
                model_kwargs = {
                    "torch_dtype": torch.float32,
                    "low_cpu_mem_usage": True,
                    "trust_remote_code": self.trust_remote_code,
                    "local_files_only": True
                }
                
                self.model = Gemma3nForConditionalGeneration.from_pretrained(
                    local_model_path,
                    **model_kwargs
                ).eval()
                
                # Move to CPU device explicitly
                self.model = self.model.to(self.device)
                
                # Log CPU loading details
                logger.info(f"Model loaded on CPU. Device: {next(self.model.parameters()).device}")
                logger.info(f"Model dtype: {next(self.model.parameters()).dtype}")
            
            # Update memory usage
            self._update_memory_usage()
            
            self.status = "running"
            logger.info(f"Successfully initialized Gemma instance {self.instance_id} from local model")
            
        except Exception as e:
            self.status = "error"
            self.error_message = str(e)
            logger.error(f"Failed to initialize Gemma instance {self.instance_id}: {e}")
            raise
    
    def _update_memory_usage(self):
        """Update memory usage statistics."""
        try:
            if self.model is not None:
                if hasattr(self.model, 'get_memory_footprint'):
                    self.memory_usage_mb = self.model.get_memory_footprint() / (1024 * 1024)
                else:
                    # Estimate based on parameters
                    param_count = sum(p.numel() for p in self.model.parameters())
                    bytes_per_param = 2 if self.load_in_4bit else 4  # Rough estimate
                    self.memory_usage_mb = (param_count * bytes_per_param) / (1024 * 1024)
        except Exception as e:
            logger.warning(f"Could not update memory usage for {self.instance_id}: {e}")
            self.memory_usage_mb = 0.0
    
    def is_ready(self) -> bool:
        """Check if the instance is fully loaded and ready for inference."""
        return (self.status == "running" and 
                self.model is not None and 
                self.processor is not None and 
                hasattr(self, 'device') and 
                self.device is not None)
    
    def is_processing(self) -> bool:
        """Check if the instance is currently processing."""
        return self._processing
    
    def cancel_processing(self):
        """Request cancellation of current processing."""
        logger.info(f"Cancellation requested for instance {self.instance_id}")
        self._cancel_processing = True
    
    async def generate_response(self, prompt: str) -> str:
        """Generate a response to the given prompt."""
        if not self.is_ready():
            raise RuntimeError(f"Instance {self.instance_id} is not ready (status: {self.status}, model: {self.model is not None}, processor: {self.processor is not None})")
        
        with self._lock:
            try:
                # Use proper message structure with both system and user prompts
                messages = [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": self.config.system_prompt}]
                    },
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": prompt}]
                    }
                ]
                
                # Apply chat template and tokenize
                inputs = self.processor.apply_chat_template(
                    messages,
                    add_generation_prompt=True,
                    tokenize=True,
                    return_dict=True,
                    return_tensors="pt",
                ).to(self.model.device, dtype=self.model.dtype)  # Direct assignment like Kaggle
                
                input_len = inputs["input_ids"].shape[-1]
                logger.debug(f"Input length: {input_len} tokens")
                
                # Generation parameters - fix token calculation 
                max_new_tokens = self.config.max_length - input_len
                max_new_tokens = max(50, min(max_new_tokens, 100))  # Ensure at least 50 tokens
                
                # Generate response following Kaggle example exactly
                with torch.inference_mode():
                    outputs = self.model.generate(
                        **inputs,
                        max_new_tokens=max_new_tokens,
                        disable_compile=True,  # Same as Kaggle example
                    )
                
                # Decode using Kaggle approach
                response = self.processor.batch_decode(
                    outputs[:, input_len:],
                    skip_special_tokens=True,
                )[0]
                
                return response
                
            except Exception as e:
                logger.error(f"Generation failed for instance {self.instance_id}: {e}")
                raise
    
    def _get_device_info_string(self) -> str:
        """Get formatted device information string."""
        if not hasattr(self, 'device_details'):
            return self.device if self.device else "unknown"
        
        details = self.device_details
        if details["type"] == "cuda":
            return f"CUDA: {details['name']} ({details['memory_gb']:.1f}GB)"
        elif details["type"] == "cpu":
            if "fallback_from" in details:
                return f"CPU ({details['cores']} cores) - CUDA unavailable"
            else:
                return f"CPU ({details['cores']} cores)"
        return self.device if self.device else "unknown"
    
    def get_actual_device(self) -> str:
        """Get the actual device being used (after any fallbacks)."""
        return getattr(self, 'actual_device', self.device)
    
    def get_info(self) -> GemmaInstanceInfo:
        """Get information about this instance."""
        return GemmaInstanceInfo(
            instance_id=self.instance_id,
            config=self.config,
            status=self.status,
            memory_usage_mb=self.memory_usage_mb,
            device_info=self._get_device_info_string(),
            created_at=self.created_at,
            error_message=self.error_message
        )
    
    def shutdown(self):
        """Shutdown this instance and free resources."""
        logger.info(f"Shutting down Gemma instance {self.instance_id}")
        with self._lock:
            try:
                if self.model is not None:
                    del self.model
                    self.model = None
                if self.processor is not None:
                    del self.processor
                    self.processor = None
                
                # Clear CUDA cache if applicable
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                self.status = "stopped"
                logger.info(f"Successfully shut down Gemma instance {self.instance_id}")
                
            except Exception as e:
                logger.error(f"Error during shutdown of instance {self.instance_id}: {e}")
                self.status = "error"
                self.error_message = f"Shutdown error: {str(e)}"

class GemmaManager:
    """Manages multiple Gemma instances."""
    
    def __init__(self):
        self.instances: Dict[str, GemmaInstance] = {}
        self.executor = ThreadPoolExecutor(max_workers=4)
        self._lock = threading.Lock()
        
    async def initialize_instance(self, config: GemmaInstanceConfig, 
                                 trust_remote_code: bool = True) -> GemmaInstanceInfo:
        """Initialize a new Gemma instance."""
        if config.instance_id in self.instances:
            raise ValueError(f"Instance {config.instance_id} already exists")
        
        instance = GemmaInstance(config, trust_remote_code)
        
        with self._lock:
            self.instances[config.instance_id] = instance
        
        try:
            # Initialize in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(self.executor, lambda: asyncio.run(instance.initialize()))
            return instance.get_info()
            
        except Exception as e:
            # Remove failed instance
            with self._lock:
                self.instances.pop(config.instance_id, None)
            raise
    
    async def chat(self, instance_id: str, message: str) -> ChatResponse:
        """Send a chat message to an instance."""
        instance = self.get_instance(instance_id)
        
        start_time = time.time()
        
        try:
            response = await instance.generate_response(message)
            generation_time = time.time() - start_time
            
            # Fix: Use tokenizer to encode for token count, not processor
            token_count = None
            try:
                if instance.processor and hasattr(instance.processor, 'tokenizer'):
                    token_count = len(instance.processor.tokenizer.encode(response))
            except Exception:
                # If token counting fails, just leave it as None
                pass
            
            return ChatResponse(
                instance_id=instance_id,
                prompt=message,
                response=response,
                generation_time_seconds=generation_time,
                token_count=token_count,
                truncated=False  # TODO: Implement truncation detection
            )
            
        except Exception as e:
            logger.error(f"Chat failed for instance {instance_id}: {e}")
            raise
    
    async def analyze_image(self, instance_id: str, image_data: str, 
                           prompt: str, timeout_seconds: int = None) -> ImageAnalysisResponse:
        """Analyze an image with an instance using multimodal capabilities."""
        instance = self.get_instance(instance_id)
        
        # Check if instance is ready for inference
        if not instance.is_ready():
            raise ValueError(f"Instance {instance_id} is not ready for inference. Status: {instance.status}, Model loaded: {instance.model is not None}")
        
        try:
            # Remove timeout to allow processing to complete naturally
            return await self._analyze_image_impl(instance, instance_id, image_data, prompt)
        except Exception as e:
            logger.error(f"Image analysis failed for instance {instance_id}: {e}")
            raise
    
    async def analyze_image_from_pil(self, instance_id: str, image: Image.Image, 
                                   prompt: str) -> ImageAnalysisResponse:
        """Analyze a PIL Image directly (like Kaggle example)."""
        instance = self.get_instance(instance_id)
        
        # Check if instance is ready for inference
        if not instance.is_ready():
            raise ValueError(f"Instance {instance_id} is not ready for inference. Status: {instance.status}, Model loaded: {instance.model is not None}")
        
        try:
            return await self._analyze_pil_image_impl(instance, instance_id, image, prompt)
        except Exception as e:
            logger.error(f"PIL image analysis failed for instance {instance_id}: {e}")
            raise
    
    async def _analyze_image_impl(self, instance: 'GemmaInstance', instance_id: str, 
                                  image_data: str, prompt: str) -> ImageAnalysisResponse:
        """Internal implementation of image analysis."""
        # Set processing flag
        instance._processing = True
        instance._cancel_processing = False
        
        try:
            # Validate base64 data size (limit to ~50MB for safety)
            max_base64_size = 50 * 1024 * 1024  # 50MB
            if len(image_data) > max_base64_size:
                raise ValueError(f"Image data too large: {len(image_data)} bytes. Max allowed: {max_base64_size}")
            
            # Check for cancellation
            if instance._cancel_processing:
                raise asyncio.CancelledError("Processing was cancelled")
            
            # Decode and validate image
            try:
                image_bytes = base64.b64decode(image_data)
                image = Image.open(io.BytesIO(image_bytes))
            except Exception as e:
                raise ValueError(f"Invalid image data: {str(e)}")
            
            # Convert to RGB if needed (handle RGBA, grayscale, etc.)
            if image.mode != 'RGB':
                logger.info(f"Converting image from {image.mode} to RGB")
                image = image.convert('RGB')
            
            # Validate image dimensions
            if image.size[0] < 10 or image.size[1] < 10:
                raise ValueError(f"Image too small: {image.size}. Minimum size is 10x10")
            
            original_size = image.size
            
            # Use exact preprocessing from working Kaggle example
            target_size = (100, 100)
            original_width, original_height = image.size
            aspect_ratio = original_width / original_height

            if aspect_ratio > 1:
                # Width is larger
                new_width = target_size[0]
                new_height = int(target_size[0] / aspect_ratio)
            else:
                # Height is larger or equal
                new_height = target_size[1]
                new_width = int(target_size[1] * aspect_ratio)

            # Resize image maintaining aspect ratio
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Create a new image with target size and paste the resized image
            processed_image = Image.new("RGB", target_size, (255, 255, 255))  # White background

            # Calculate position to center the image
            x_offset = (target_size[0] - new_width) // 2
            y_offset = (target_size[1] - new_height) // 2

            processed_image.paste(image, (x_offset, y_offset))
            image = processed_image
            
            logger.info(f"Processed image: {original_size} -> {image.size}")
            
            # Check for cancellation before processing
            if instance._cancel_processing:
                raise asyncio.CancelledError("Processing was cancelled")
            
            with instance._lock:
                # Use proper message structure with both system and user prompts
                messages = [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": instance.config.system_prompt}]
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "image": image},
                            {"type": "text", "text": prompt}
                        ]
                    }
                ]
                
                # Apply chat template and process - exact same as Kaggle example
                inputs = instance.processor.apply_chat_template(
                    messages,
                    add_generation_prompt=True,
                    tokenize=True,
                    return_dict=True,
                    return_tensors="pt",
                ).to(instance.model.device, dtype=instance.model.dtype)  # Direct assignment like Kaggle
                
                input_len = inputs["input_ids"].shape[-1]
                
                start_time = time.time()
                
                # Check for cancellation one more time before generation
                if instance._cancel_processing:
                    raise asyncio.CancelledError("Processing was cancelled")
                
                # Use exact generation parameters from working Kaggle example
                with torch.inference_mode():
                    # Fix token calculation to prevent negative values
                    max_new_tokens = instance.config.max_length - input_len
                    max_new_tokens = max(50, min(max_new_tokens, 100))  # Ensure at least 50 tokens
                    
                    outputs = instance.model.generate(
                        **inputs,
                        max_new_tokens=max_new_tokens,
                        disable_compile=True,  # CRITICAL: Same as working Kaggle example
                    )
                
                # Use exact decoding from working Kaggle example
                response = instance.processor.batch_decode(
                    outputs[:, input_len:],
                    skip_special_tokens=True,
                )[0]
                
                generation_time = time.time() - start_time
            
            return ImageAnalysisResponse(
                instance_id=instance_id,
                prompt=prompt,
                response=response,
                generation_time_seconds=generation_time,
                image_dimensions=original_size,  # Return original dimensions
                token_count=len(outputs[0][input_len:]),
                truncated=False
            )
        finally:
            # Always clear processing flag
            instance._processing = False
            instance._cancel_processing = False
    
    async def _analyze_pil_image_impl(self, instance: 'GemmaInstance', instance_id: str, 
                                     image: Image.Image, prompt: str) -> ImageAnalysisResponse:
        """Internal implementation using PIL Image directly - following HuggingFace docs exactly."""
        # Set processing flag
        instance._processing = True
        instance._cancel_processing = False
        
        try:
            original_size = image.size
            logger.info(f"Processing PIL image: {original_size}, mode: {image.mode}")
            
            # Check for cancellation
            if instance._cancel_processing:
                raise asyncio.CancelledError("Processing was cancelled")
            
            # Convert to RGB if needed (HuggingFace docs requirement)
            if image.mode != "RGB":
                logger.info(f"Converting image from {image.mode} to RGB")
                image = image.convert("RGB")
            
            # NO PREPROCESSING - let the model handle resizing like HuggingFace docs
            
            with instance._lock:
                # Follow HuggingFace docs exactly - use image directly in messages
                messages = [
                    {
                        "role": "system",
                        "content": [{"type": "text", "text": instance.config.system_prompt}]
                    },
                    {
                        "role": "user", 
                        "content": [
                            {"type": "image", "image": image},  # Use PIL image directly like docs
                            {"type": "text", "text": prompt}
                        ]
                    }
                ]
                
                # Follow HuggingFace docs exactly
                inputs = instance.processor.apply_chat_template(
                    messages,
                    add_generation_prompt=True,
                    tokenize=True,
                    return_dict=True,
                    return_tensors="pt",
                ).to(instance.model.device, dtype=torch.bfloat16)  # Use bfloat16 like docs
                
                input_len = inputs["input_ids"].shape[-1]
                logger.info(f"Input tokens: {input_len}")
                
                start_time = time.time()
                
                # Check for cancellation one more time
                if instance._cancel_processing:
                    raise asyncio.CancelledError("Processing was cancelled")
                
                # Follow HuggingFace docs exactly - minimal parameters
                with torch.inference_mode():
                    generation = instance.model.generate(
                        **inputs, 
                        max_new_tokens=100,  # Fixed value like docs
                        do_sample=False      # Exactly like docs
                    )
                    generation = generation[0][input_len:]  # Extract new tokens like docs
                
                # Decode exactly like docs
                response = instance.processor.decode(generation, skip_special_tokens=True)
                logger.info(f"Generated response: {response[:100]}...")
                
                generation_time = time.time() - start_time
            
            return ImageAnalysisResponse(
                instance_id=instance_id,
                prompt=prompt,
                response=response,
                generation_time_seconds=generation_time,
                image_dimensions=original_size,
                token_count=len(generation),
                truncated=False
            )
        finally:
            # Always clear processing flag
            instance._processing = False
            instance._cancel_processing = False

    
    def get_instance(self, instance_id: str) -> GemmaInstance:
        """Get an instance by ID."""
        with self._lock:
            if instance_id not in self.instances:
                raise ValueError(f"Instance {instance_id} not found")
            return self.instances[instance_id]
    
    def get_instance_info(self, instance_id: str) -> GemmaInstanceInfo:
        """Get information about an instance."""
        instance = self.get_instance(instance_id)
        return instance.get_info()
    
    def is_instance_processing(self, instance_id: str) -> bool:
        """Check if an instance is currently processing."""
        try:
            instance = self.get_instance(instance_id)
            return instance.is_processing()
        except ValueError:
            return False
    
    def list_instances(self) -> List[GemmaInstanceInfo]:
        """List all instances."""
        with self._lock:
            return [instance.get_info() for instance in self.instances.values()]
    
    async def shutdown_instance(self, instance_id: str):
        """Shutdown an instance."""
        instance = self.get_instance(instance_id)
        
        # Cancel any ongoing processing first
        if instance.is_processing():
            logger.info(f"Cancelling ongoing processing for instance {instance_id}")
            instance.cancel_processing()
            # Wait a moment for cancellation to take effect
            await asyncio.sleep(0.5)
        
        # Run shutdown in executor to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self.executor, instance.shutdown)
        
        with self._lock:
            self.instances.pop(instance_id, None)
    
    def cancel_instance_processing(self, instance_id: str):
        """Cancel ongoing processing for an instance."""
        try:
            instance = self.get_instance(instance_id)
            if instance.is_processing():
                logger.info(f"Cancelling processing for instance {instance_id}")
                instance.cancel_processing()
                return True
            return False
        except ValueError:
            return False
    
    async def shutdown_all(self):
        """Shutdown all instances."""
        instance_ids = list(self.instances.keys())
        for instance_id in instance_ids:
            try:
                await self.shutdown_instance(instance_id)
            except Exception as e:
                logger.error(f"Error shutting down instance {instance_id}: {e}")
    
    def get_system_status(self) -> dict:
        """Get system-wide status."""
        with self._lock:
            instances = list(self.instances.values())
        
        total_instances = len(instances)
        running_instances = sum(1 for i in instances if i.status == "running")
        total_memory_usage = sum(i.memory_usage_mb for i in instances)
        
        # System info
        memory = psutil.virtual_memory()
        available_memory_gb = memory.available / (1024 ** 3)
        
        gpu_available = torch.cuda.is_available()
        gpu_memory_usage = None
        if gpu_available and torch.cuda.device_count() > 0:
            gpu_memory_usage = torch.cuda.memory_allocated(0) / (1024 ** 2)  # MB
        
        return {
            "total_instances": total_instances,
            "running_instances": running_instances,
            "total_memory_usage_mb": total_memory_usage,
            "available_memory_gb": available_memory_gb,
            "gpu_available": gpu_available,
            "gpu_memory_usage_mb": gpu_memory_usage,
            "cpu_threads": os.cpu_count() or 1,
            "instances": [i.get_info() for i in instances]
        }

# Global manager instance
gemma_manager = GemmaManager()
