// FastAPI utility functions for agent management

// Base URL for the FastAPI backend
// In development, this should point to your local FastAPI server
// In production, this will be the same host since FastAPI serves the frontend
const API_BASE_URL = window.location.origin;

/**
 * Initialize a Gemma instance via FastAPI
 * @param {Object} agentData - Agent configuration from the frontend
 * @returns {Promise<Object>} - API response
 */
export async function initializeAgent(agentData) {
    try {
        console.log('[API] Initializing agent via FastAPI:', agentData);
        
        // Map frontend agent data to FastAPI parameters
        const params = new URLSearchParams({
            instance_id: agentData.id,
            model_name: agentData.modelName || 'google/gemma-3n-E2B-it',
            device: agentData.device || 'auto',
            max_length: String(agentData.maxLength || 100),
            system_prompt: agentData.systemPrompt || 'You are a helpful AI assistant analyzing images.',
            user_prompt_template: agentData.userPrompt || 'What do you see in this image?',
            do_sample: String(agentData.doSample !== undefined ? agentData.doSample : true)
        });

        const response = await fetch(`${API_BASE_URL}/api/initialize-gemma-instance?${params}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`HTTP ${response.status}: ${errorData.detail || errorData.error || 'Failed to initialize agent'}`);
        }

        const result = await response.json();
        console.log('[API] Agent initialization successful:', result);
        return { success: true, data: result };
        
    } catch (error) {
        console.error('[API] Agent initialization failed:', error);
        return { 
            success: false, 
            error: error.message || 'Failed to initialize agent'
        };
    }
}

/**
 * Shutdown a Gemma instance via FastAPI
 * @param {string} agentId - Agent ID to shutdown
 * @returns {Promise<Object>} - API response
 */
export async function shutdownAgent(agentId) {
    try {
        console.log('[API] Shutting down agent via FastAPI:', agentId);
        
        const response = await fetch(`${API_BASE_URL}/api/shutdown-instance/${encodeURIComponent(agentId)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`HTTP ${response.status}: ${errorData.detail || errorData.error || 'Failed to shutdown agent'}`);
        }

        const result = await response.json();
        console.log('[API] Agent shutdown successful:', result);
        return { success: true, data: result };
        
    } catch (error) {
        console.error('[API] Agent shutdown failed:', error);
        return { 
            success: false, 
            error: error.message || 'Failed to shutdown agent'
        };
    }
}

/**
 * Get the status of a specific agent
 * @param {string} agentId - Agent ID to check
 * @returns {Promise<Object>} - API response
 */
export async function getAgentStatus(agentId) {
    try {
        console.log('[API] Getting agent status via FastAPI:', agentId);
        
        const response = await fetch(`${API_BASE_URL}/api/instance-status/${encodeURIComponent(agentId)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`HTTP ${response.status}: ${errorData.detail || errorData.error || 'Failed to get agent status'}`);
        }

        const result = await response.json();
        console.log('[API] Agent status retrieved:', result);
        return { success: true, data: result };
        
    } catch (error) {
        console.error('[API] Get agent status failed:', error);
        return { 
            success: false, 
            error: error.message || 'Failed to get agent status'
        };
    }
}

/**
 * Shutdown all Gemma instances via FastAPI
 * @returns {Promise<Object>} - API response
 */
export async function shutdownAllAgents() {
    try {
        console.log('[API] Shutting down all agents via FastAPI...');
        
        const response = await fetch(`${API_BASE_URL}/api/shutdown-all-instances`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`HTTP ${response.status}: ${errorData.detail || errorData.error || 'Failed to shutdown all agents'}`);
        }

        const result = await response.json();
        console.log('[API] All agents shutdown successful:', result);
        return { success: true, data: result };
        
    } catch (error) {
        console.error('[API] Shutdown all agents failed:', error);
        return { 
            success: false, 
            error: error.message || 'Failed to shutdown all agents'
        };
    }
}

/**
 * Cancel ongoing processing for a specific agent
 * @param {string} agentId - Agent ID to cancel processing for
 * @returns {Promise<Object>} - API response
 */
export async function cancelAgentProcessing(agentId) {
    try {
        console.log('[API] Cancelling agent processing via FastAPI:', agentId);
        
        const response = await fetch(`${API_BASE_URL}/api/cancel-processing/${encodeURIComponent(agentId)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`HTTP ${response.status}: ${errorData.detail || errorData.error || 'Failed to cancel processing'}`);
        }

        const result = await response.json();
        console.log('[API] Agent processing cancellation successful:', result);
        return { success: true, data: result };
        
    } catch (error) {
        console.error('[API] Cancel agent processing failed:', error);
        return { 
            success: false, 
            error: error.message || 'Failed to cancel processing'
        };
    }
}

/**
 * Process an image with a specific agent using multipart/form-data
 * @param {string} agentId - Agent ID to process with
 * @param {string} imageDataUrl - Base64 data URL from webcam (e.g. "data:image/jpeg;base64,...")
 * @param {string} userPrompt - Custom user prompt for image analysis
 * @returns {Promise<Object>} - API response
 */
export async function processImage(agentId, imageDataUrl, userPrompt = "What do you see in this image?") {
    try {
        console.log('[API] Processing image via FastAPI with multipart upload:', agentId, 'Prompt:', userPrompt);
        
        // Convert base64 data URL to Blob
        const response = await fetch(imageDataUrl);
        const blob = await response.blob();
        
        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('file', blob, 'webcam-capture.jpg');
        formData.append('instance_id', agentId);
        formData.append('user_prompt', userPrompt);
        
        // Try the new multipart endpoint first, fall back to JSON if not available
        let apiResponse;
        try {
            // First try multipart endpoint (more efficient)
            apiResponse = await fetch(`${API_BASE_URL}/api/analyze-image-multipart`, {
                method: 'POST',
                body: formData // Don't set Content-Type header, let browser set it with boundary
            });
        } catch (multipartError) {
            console.log('[API] Multipart endpoint not available, falling back to base64 JSON...');
            
            // Fall back to existing base64 JSON endpoint
            // Extract base64 data from data URL
            const base64Data = imageDataUrl.split(',')[1];
            
            const jsonPayload = {
                instance_id: agentId,
                image_data: base64Data
            };
            
            apiResponse = await fetch(`${API_BASE_URL}/api/analyze-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(jsonPayload)
            });
        }

        if (!apiResponse.ok) {
            const errorData = await apiResponse.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`HTTP ${apiResponse.status}: ${errorData.detail || errorData.error || 'Failed to process image'}`);
        }

        const result = await apiResponse.json();
        console.log('[API] Image processing successful:', result);
        return { success: true, data: result };
        
    } catch (error) {
        console.error('[API] Image processing failed:', error);
        return { 
            success: false, 
            error: error.message || 'Failed to process image'
        };
    }
}

/**
 * Get device capabilities from the backend
 * @returns {Promise<Object>} - Device capabilities including CUDA availability
 */
export async function getDeviceCapabilities() {
    try {
        console.log('[API] Getting device capabilities');
        
        const response = await fetch(`${API_BASE_URL}/api/device-capabilities`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('[API] Device capabilities response:', data);
        return data;
    } catch (error) {
        console.error('[API] Failed to get device capabilities:', error);
        // Return safe defaults on error
        return {
            cuda_available: false,
            cpu_available: true,
            recommended_device: "cpu"
        };
    }
}
