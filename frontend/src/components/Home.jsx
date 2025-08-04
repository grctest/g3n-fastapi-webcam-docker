// ...existing code...

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from 'react-markdown';
import EasySpeech from 'easy-speech';
import { useStore } from "@nanostores/react";
import Webcam from "react-webcam";
import { useTranslation } from "react-i18next";

import { ExclamationTriangleIcon, PlusIcon, TrashIcon, Pencil2Icon, PauseIcon, PlayIcon, ReloadIcon, ClockIcon } from "@radix-ui/react-icons";
import { FixedSizeList as List } from 'react-window';


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

import { i18n as i18nInstance, locale } from "@/lib/i18n.js";
import { agentStore } from "../stores/agentStore";
import { detectionStore, addDetection, removeDetection, clearAllDetections } from "../stores/detectionStore";

import { PersonaForm } from './PersonaForm';
import { initializeAgent, getAgentStatus, processImage, shutdownAgent, cancelAgentProcessing, getDeviceCapabilities } from '../lib/api.js';
import { compressImage, getImageMetadata } from '../lib/imageUtils.js';

export default function Home() {
    const { t, i18n } = useTranslation(locale.get(), { i18n: i18nInstance });
    const agents = useStore(agentStore);
    const activeDetections = useStore(detectionStore);

    const [agentProcessing, setAgentProcessing] = useState({}); // { [agentId]: boolean }
    const [agentPendingPause, setAgentPendingPause] = useState({}); // { [agentId]: boolean } - agents that will pause after current processing
    const [agentCountdowns, setAgentCountdowns] = useState({}); // { [agentId]: number }

    const [agentErrors, setAgentErrors] = useState({}); // { [agentId]: errorMsg }
    const [agentRemoving, setAgentRemoving] = useState({}); // { [agentId]: boolean }
    const [imageProcessingStats, setImageProcessingStats] = useState({}); // { [agentId]: { lastProcessTime, avgProcessTime, errorCount } }

    const [editAgentId, setEditAgentId] = useState(null);
    const [agentDialogOpen, setAgentDialogOpen] = useState(false);
    const [highlightedAgentId, setHighlightedAgentId] = useState(null);
    const [agentResults, setAgentResults] = useState({});
    const [agentStatuses, setAgentStatuses] = useState({});
    const [agentReadiness, setAgentReadiness] = useState({}); // Track if agents are ready for inference
    const [videoDevices, setVideoDevices] = useState([]);
    const [selectedVideoDevice, setSelectedVideoDevice] = useState("");
    
    // New state for UI improvements
    const [detectionDialog, setDetectionDialog] = useState({ 
        open: false, 
        content: '', 
        agentName: '', 
        imageData: null, 
        timestamp: null, 
        processingTime: null, 
        memoryUsage: null 
    });
    const [agentDeviceTypes, setAgentDeviceTypes] = useState({}); // Track actual device types for interval adjustment
    const [agentTimers, setAgentTimers] = useState({}); // Track processing timers for each agent
    const [agentMemoryUsage, setAgentMemoryUsage] = useState({}); // Track memory usage separately
    const [initializationComplete, setInitializationComplete] = useState(false); // Track if initial agent setup is done
    const [currentSpeech, setCurrentSpeech] = useState(null); // Track current TTS speech
    const [isSpeaking, setIsSpeaking] = useState(false); // Track if TTS is active
    const [isCopied, setIsCopied] = useState(false); // Track copy status
    
    // Audio settings state
    const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
    const [viewAgentDialogOpen, setViewAgentDialogOpen] = useState(false);
    const [viewAgentData, setViewAgentData] = useState(null);
    const [availableVoices, setAvailableVoices] = useState([]);
    const [audioSettings, setAudioSettings] = useState({
        voice: null, // Will be set to first available voice
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0
    });

    const webcamRef = useRef(null);
    const agentIntervals = useRef({});
    const [webcamAvailable, setWebcamAvailable] = useState(false);
    const [checkingWebcam, setCheckingWebcam] = useState(false);
    
    // Device capabilities state - checked once on app launch
    const [deviceCapabilities, setDeviceCapabilities] = useState(null);
    const [loadingDeviceCapabilities, setLoadingDeviceCapabilities] = useState(true);

    // Check device capabilities on component mount (app launch)
    useEffect(() => {
        const checkDeviceCapabilities = async () => {
            console.log('[Home] Checking device capabilities on app launch...');
            setLoadingDeviceCapabilities(true);
            
            try {
                const capabilities = await getDeviceCapabilities();
                console.log('[Home] Device capabilities loaded:', capabilities);
                
                // Log user-friendly GPU status
                if (capabilities.cuda_available) {
                    if (capabilities.cuda_compatible) {
                        console.log(`[Home] ✅ GPU Compatible: ${capabilities.cuda_device_name} (CUDA ${capabilities.cuda_capability})`);
                        if (capabilities.bfloat16_supported) {
                            console.log('[Home] ✨ Native bfloat16 support available for optimal performance');
                        } else {
                            console.log('[Home] ⚠️ Limited bfloat16 support - performance may be reduced');
                        }
                    } else {
                        console.warn(`[Home] ⚠️ GPU Incompatible: ${capabilities.cuda_device_name} (CUDA ${capabilities.cuda_capability})`);
                        console.warn(`[Home] Reason: ${capabilities.incompatibility_reason}`);
                        console.warn('[Home] Falling back to CPU mode for compatibility');
                    }
                } else {
                    console.log('[Home] 💻 Using CPU mode - No GPU detected');
                }
                
                setDeviceCapabilities(capabilities);
                
                // Store globally so PersonaForm can access without re-fetching
                window.globalDeviceCapabilities = capabilities;
                
            } catch (error) {
                console.error('[Home] Failed to check device capabilities:', error);
                // Set safe defaults
                const safeDefaults = {
                    cuda_available: false,
                    cpu_available: true,
                    recommended_device: 'cpu',
                    cuda_compatible: false,
                    bfloat16_supported: false,
                    incompatibility_reason: 'Failed to check device capabilities'
                };
                setDeviceCapabilities(safeDefaults);
                window.globalDeviceCapabilities = safeDefaults;
            } finally {
                setLoadingDeviceCapabilities(false);
            }
        };
        
        checkDeviceCapabilities();
    }, []); // Only run once on mount

    // Initialize EasySpeech on component mount
    useEffect(() => {
        const initSpeech = async () => {
            try {
                await EasySpeech.init();
                console.log('EasySpeech initialized successfully');
                
                // Load available voices
                const voices = EasySpeech.voices();
                setAvailableVoices(voices);
                
                // Set default voice if available
                if (voices.length > 0) {
                    setAudioSettings(prev => ({
                        ...prev,
                        voice: voices[0]
                    }));
                }
            } catch (error) {
                console.error('Failed to initialize EasySpeech:', error);
            }
        };
        initSpeech();
    }, []);

    // TTS Helper Functions
    const stopSpeech = useCallback(() => {
        if (isSpeaking) {
            EasySpeech.cancel();
            setIsSpeaking(false);
            setCurrentSpeech(null);
        }
    }, [isSpeaking]);

    const speakText = useCallback(async (text, detectionId, agentName = '') => {
        if (isSpeaking) {
            stopSpeech();
            return;
        }

        try {
            setIsSpeaking(true);
            setCurrentSpeech(detectionId);
            
            // Prefix with agent name if provided
            const textToSpeak = agentName ? `${agentName}: ${text}` : text;
            
            await EasySpeech.speak({
                text: textToSpeak.replace(/\*\*/g, '').replace(/\*/g, ''), // Remove markdown formatting
                voice: audioSettings.voice || EasySpeech.voices()[0], // Use configured voice or default
                rate: audioSettings.rate,
                pitch: audioSettings.pitch,
                volume: audioSettings.volume,
                end: () => {
                    setIsSpeaking(false);
                    setCurrentSpeech(null);
                }
            });
        } catch (error) {
            console.error('TTS Error:', error);
            setIsSpeaking(false);
            setCurrentSpeech(null);
        }
    }, [isSpeaking, stopSpeech, audioSettings]);

    // Copy to clipboard function
    const copyToClipboard = useCallback(async (text) => {
        try {
            // Remove markdown formatting for cleaner copy
            const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '');
            await navigator.clipboard.writeText(cleanText);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            // Fallback for older browsers
            const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '');
            const textArea = document.createElement('textarea');
            textArea.value = cleanText;
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            } catch (fallbackError) {
                console.error('Fallback copy failed:', fallbackError);
            }
            document.body.removeChild(textArea);
        }
    }, []);

    // Cleanup TTS on component unmount and when dialog content changes
    useEffect(() => {
        return () => {
            stopSpeech();
        };
    }, [stopSpeech]);

    // Stop TTS when detection dialog content changes
    useEffect(() => {
        if (currentSpeech === 'dialog' && detectionDialog.open) {
            // If dialog content changes while speaking, stop current speech
            stopSpeech();
        }
        // Reset copy status when dialog content changes
        setIsCopied(false);
    }, [detectionDialog.content, currentSpeech, stopSpeech]);

                // Check for webcam devices on mount
    // Webcam detection logic as a function for manual refresh
    const checkWebcam = async () => {
        setCheckingWebcam(true);
        setWebcamAvailable(false);
        setVideoDevices([]);
        setSelectedVideoDevice("");
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(device => device.kind === 'videoinput');
                setVideoDevices(videoInputs);
                const hasWebcam = videoInputs.length > 0;
                setWebcamAvailable(hasWebcam);

                // Always reset selected device to first available
                if (hasWebcam) {
                    setSelectedVideoDevice(videoInputs[0].deviceId);
                }

                // Note: No need to pause agents here as they're managed via FastAPI
            } catch (err) {
                setWebcamAvailable(false);
                setVideoDevices([]);
                setSelectedVideoDevice("");
            }
        } else {
            setWebcamAvailable(false);
            setVideoDevices([]);
            setSelectedVideoDevice("");
        }
        // Add a 1 second delay before hiding the checking message
        setTimeout(() => {
            setCheckingWebcam(false);
        }, 1000);
    };

    useEffect(() => {
        // Don't initialize agents until device capabilities are loaded
        if (loadingDeviceCapabilities || !deviceCapabilities) {
            console.log("[DEBUG] Waiting for device capabilities to be loaded before initializing app...");
            return;
        }

        console.log("[DEBUG] Device capabilities loaded, proceeding with app initialization...");

        const initializeApp = async () => {
            console.log("[DEBUG] App starting with device capabilities:", deviceCapabilities);

            // FIRST: Clear any existing intervals and reset states
            Object.values(agentIntervals.current).forEach(clearInterval);
            agentIntervals.current = {};
            setAgentProcessing({});
            setAgentPendingPause({});
            setAgentCountdowns({});
            setAgentErrors({});
            setAgentResults({});
            clearAllDetections();  // Clear persistent detections on app start
            setAgentTimers({}); // Clear any existing timers
            setAgentMemoryUsage({}); // Clear memory usage state
            setInitializationComplete(false); // Reset initialization flag
            console.log("[DEBUG] Cleared all existing intervals and states.");

            // SECOND: Ensure all agents in store are set to paused before any initialization
            if (agents && agents.length > 0) {
                console.log(`[DEBUG] Found ${agents.length} agents in store. Setting all to paused first...`);
                
                // Set all agents to paused IMMEDIATELY before any other operations
                const pausedAgents = agents.map(agent => ({ ...agent, paused: true }));
                agentStore.set(pausedAgents);
                console.log("[DEBUG] All agents set to paused state in UI BEFORE initialization.");

                // Now initialize each agent via FastAPI
                for (const agent of pausedAgents) {  // Use pausedAgents, not original agents
                    try {
                        console.log(`[DEBUG] Initializing agent ${agent.id} via FastAPI...`);
                        const result = await initializeAgent(agent);
                        if (result.success) {
                            console.log(`[DEBUG] Agent ${agent.id} initialized successfully`);
                        } else {
                            console.error(`[DEBUG] Failed to initialize agent ${agent.id}:`, result.error);
                            setAgentErrors(prev => ({ ...prev, [agent.id]: result.error }));
                        }
                    } catch (error) {
                        console.error(`[DEBUG] Error initializing agent ${agent.id}:`, error);
                        setAgentErrors(prev => ({ ...prev, [agent.id]: error.message }));
                    }
                }
                
                console.log("[DEBUG] All agents initialized with paused state.");
                setInitializationComplete(true); // Mark initialization as complete
                
                // Check webcam after agent setup
                console.log("[DEBUG] Now checking webcam...");
                await checkWebcam();
            } else {
                console.log("[DEBUG] No agents found in store. Checking webcam directly...");
                setInitializationComplete(true); // Mark as complete even with no agents
                await checkWebcam();
            }
        };

        initializeApp();
        
        // Cleanup function to shutdown all agents when component unmounts
        return () => {
            console.log("[DEBUG] Home component unmounting, cleaning up agents...");
            const currentAgents = agentStore.get();
            
            // Shutdown all agents via FastAPI
            currentAgents.forEach(async (agent) => {
                try {
                    console.log(`[DEBUG] Shutting down agent ${agent.id} during cleanup...`);
                    await shutdownAgent(agent.id);
                } catch (error) {
                    console.error(`[DEBUG] Error shutting down agent ${agent.id} during cleanup:`, error);
                }
            });
        };
    }, [loadingDeviceCapabilities, deviceCapabilities]); // Depend on device capabilities

    // Remove the download completion watcher as downloads are handled by Docker
    // useEffect removed

    const handleRemoveAgent = async (agent) => {
        console.log(`[DEBUG] Removing agent ${agent.id} (${agent.label})`);
        
        // Set loading state
        setAgentRemoving(prev => ({ ...prev, [agent.id]: true }));
        
        try {
            // If agent is processing, cancel it first
            if (agentProcessing[agent.id]) {
                console.log(`[DEBUG] Agent ${agent.id} is processing, cancelling before removal...`);
                try {
                    const cancelResult = await cancelAgentProcessing(agent.id);
                    if (cancelResult.success) {
                        console.log(`[DEBUG] Processing cancelled for agent ${agent.id} before removal`);
                    }
                } catch (cancelError) {
                    console.warn(`[DEBUG] Failed to cancel processing before removal:`, cancelError);
                }
                
                // Reset processing state
                setAgentProcessing(prev => ({ ...prev, [agent.id]: false }));
            }
            
            // Now shutdown the agent via FastAPI
            console.log(`[DEBUG] Shutting down agent ${agent.id} via FastAPI...`);
            const result = await shutdownAgent(agent.id);
            
            if (result.success) {
                console.log(`[DEBUG] Agent ${agent.id} shutdown successful:`, result.data);
            } else {
                console.warn(`[DEBUG] Agent ${agent.id} shutdown failed, but continuing with removal:`, result.error);
            }
        } catch (error) {
            console.error(`[DEBUG] Error during agent ${agent.id} shutdown:`, error);
        } finally {
            // Clear loading state
            setAgentRemoving(prev => {
                const newRemoving = { ...prev };
                delete newRemoving[agent.id];
                return newRemoving;
            });
        }
        
        // Remove agent from local store regardless of shutdown result
        agentStore.set(agentStore.get().filter(a => a.id !== agent.id));
        
        // Clear any interval for this agent
        if (agentIntervals.current[agent.id]) {
            clearInterval(agentIntervals.current[agent.id]);
            delete agentIntervals.current[agent.id];
        }
        
        // Refresh statuses of remaining agents
        setTimeout(() => refreshAgentStatuses(), 500); // Small delay to let backend settle
        
        // Clear any errors or results for this agent
        setAgentErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[agent.id];
            return newErrors;
        });
        
        setAgentResults(prev => {
            const newResults = { ...prev };
            delete newResults[agent.id];
            return newResults;
        });
        
        setAgentStatuses(prev => {
            const newStatuses = { ...prev };
            delete newStatuses[agent.id];
            return newStatuses;
        });
        
        setImageProcessingStats(prev => {
            const newStats = { ...prev };
            delete newStats[agent.id];
            return newStats;
        });
        
        setAgentProcessing(prev => {
            const newProcessing = { ...prev };
            delete newProcessing[agent.id];
            return newProcessing;
        });
        
        setAgentPendingPause(prev => {
            const newPendingPause = { ...prev };
            delete newPendingPause[agent.id];
            return newPendingPause;
        });
        
        setAgentCountdowns(prev => {
            const newCountdowns = { ...prev };
            delete newCountdowns[agent.id];
            return newCountdowns;
        });
        
        console.log(`[DEBUG] Agent ${agent.id} removed from local state`);
    };

    const toggleAgentPause = async (agent) => {
        console.log(`[DEBUG] Toggling pause for agent ${agent.id}. Current paused state: ${agent.paused}`);
        const isPausing = !agent.paused;

        // If pausing and agent is currently processing, handle gracefully
        if (isPausing && agentProcessing[agent.id]) {
            try {
                console.log(`[DEBUG] Agent ${agent.id} is currently processing. Setting pending pause state.`);
                
                // Set pending pause state immediately for UI feedback
                setAgentPendingPause(prev => ({ ...prev, [agent.id]: true }));
                
                // Still call cancel to prevent future processing
                console.log(`[DEBUG] Cancelling processing for agent ${agent.id} before pausing`);
                const cancelResult = await cancelAgentProcessing(agent.id);
                if (cancelResult.success) {
                    console.log(`[DEBUG] Processing cancellation requested for agent ${agent.id}`);
                } else {
                    console.warn(`[DEBUG] Failed to cancel processing for agent ${agent.id}:`, cancelResult.error);
                }
            } catch (error) {
                console.error(`[DEBUG] Error cancelling processing for agent ${agent.id}:`, error);
            }
        } else {
            // If not processing or resuming, clear pending pause state
            setAgentPendingPause(prev => ({ ...prev, [agent.id]: false }));
        }

        const updatedAgents = agentStore.get().map(a => {
            if (a.id === agent.id) {
                return { ...a, paused: isPausing };
            }
            return a;
        });
        agentStore.set(updatedAgents);

        if (isPausing) {
            // When pausing, clear any existing errors for this agent.
            setAgentErrors(prev => ({ ...prev, [agent.id]: null }));
            setAgentResults(prev => ({ ...prev, [agent.id]: null }));
        }

        // Update agentStatuses to reflect change immediately
        setAgentStatuses(prev => ({ ...prev, [agent.id]: isPausing ? 'paused' : 'running' }));
        console.log(`[DEBUG] Agent ${agent.id} (${agent.label}) is now ${isPausing ? 'paused' : 'active'} in UI.`);
        
        // Refresh status after toggle to ensure accuracy
        setTimeout(() => refreshAgentStatuses(agent.id), 100);
    };

    // Manual capture handler for agents with captureMode === 'manual'
    const handleManualCapture = async (agent) => {
        console.log(`[DEBUG] Manual capture triggered for agent ${agent.id} (${agent.label})`);
        
        // Check if agent is already processing
        if (agentProcessing[agent.id]) {
            console.log(`[DEBUG] Agent ${agent.id} is already processing, ignoring manual capture request`);
            return;
        }

        // Use the existing runAgent function with manual capture flag
        await runAgent(agent, true);
    };

    // Handler to view agent details in read-only mode
    const handleViewAgent = (agentId) => {
        const agent = agents.find(a => a.id === agentId);
        if (agent) {
            setViewAgentData(agent);
            setViewAgentDialogOpen(true);
        }
    };

    // Async handler for sending image to a single agent and return result for batching
    const handleSendImageToAgent = async (agent) => {
        console.log(`[DEBUG] handleSendImageToAgent: Starting for agent ${agent.id} (${agent.label})`);
        if (!webcamRef.current) {
            const errorMsg = t('webcamUnavailable');
            console.error(`[DEBUG] handleSendImageToAgent: Webcam not available for agent ${agent.id}.`);
            return { agentId: agent.id, agentName: agent.label, resultText: errorMsg, error: errorMsg };
        }

        let screenshot;
        try {
            screenshot = webcamRef.current.getScreenshot();
            if (!screenshot) {
                const errorMsg = t('webcamCaptureError');
                console.error(`[DEBUG] handleSendImageToAgent: getScreenshot() returned null or empty for agent ${agent.id}.`);
                return { agentId: agent.id, agentName: agent.label, resultText: errorMsg, error: errorMsg };
            }
            console.log(`[DEBUG] handleSendImageToAgent: Screenshot captured for agent ${agent.id}.`);
            
            // Get original image metadata for logging
            const originalMetadata = await getImageMetadata(screenshot);
            console.log(`[DEBUG] Original image metadata:`, originalMetadata);
            
            // Use original image without compression
            console.log(`[DEBUG] Using original uncompressed image`);
            
        } catch (e) {
            const errorMsg = t('webcamCaptureError');
            console.error(`[DEBUG] handleSendImageToAgent: Error capturing/processing webcam screenshot for agent ${agent.id}:`, e);
            return { agentId: agent.id, agentName: agent.label, resultText: errorMsg, error: errorMsg };
        }

        try {
            console.log(`[DEBUG] handleSendImageToAgent: Sending webcam image to FastAPI for agent ${agent.id}.`);
            
            // Use the processImage function from our API utility with the agent's user prompt
            const userPrompt = agent.userPrompt || t('Home:defaultUserPrompt');
            const response = await processImage(agent.id, screenshot, userPrompt);
            console.log(`[DEBUG] handleSendImageToAgent: Received response from FastAPI for agent ${agent.id}:`, response);

            if (response && response.success) {
                return {
                    agentId: agent.id,
                    agentName: agent.label,
                    resultText: response.data?.response || response.output,
                    imageData: screenshot,  // Include the captured image
                    error: null
                };
            } else {
                const errorMsg = response?.error || t('visionModelFailed');
                console.error(`[DEBUG] handleSendImageToAgent: FastAPI failed to process image for agent ${agent.id}. Error: ${errorMsg}`);
                return {
                    agentId: agent.id,
                    agentName: agent.label,
                    resultText: errorMsg,
                    imageData: screenshot,  // Include image even for errors
                    error: errorMsg
                };
            }
        } catch (err) {
            const errorMsg = t('backendError');
            console.error(`[DEBUG] handleSendImageToAgent: Critical error calling FastAPI for agent ${agent.id}:`, err);
            return {
                agentId: agent.id,
                agentName: agent.label,
                resultText: errorMsg,
                imageData: screenshot || null,  // Include image if available
                error: errorMsg
            };
        }
    };

    // Smart status updates - only when needed, not on a timer
    const refreshAgentStatuses = useCallback(async (specificAgentId = null) => {
        const agentsToCheck = specificAgentId ? 
            agents.filter(agent => agent.id === specificAgentId) : 
            agents;
            
        if (agentsToCheck.length === 0) return;

        const statusMap = {};
        const readinessMap = {};
        const deviceTypeMap = {};
        
        for (const agent of agentsToCheck) {
            try {
                const result = await getAgentStatus(agent.id);
                if (result.success) {
                    statusMap[agent.id] = result.data.status;
                    readinessMap[agent.id] = result.data.ready || false;
                    deviceTypeMap[agent.id] = result.data.actual_device || 'cpu';
                    
                    if (result.data.memory_usage_mb) {
                        setImageProcessingStats(prev => ({
                            ...prev,
                            [agent.id]: {
                                ...prev[agent.id],
                                memory_usage_mb: result.data.memory_usage_mb
                            }
                        }));
                        setAgentMemoryUsage(prev => ({
                            ...prev,
                            [agent.id]: result.data.memory_usage_mb
                        }));
                    }
                } else {
                    statusMap[agent.id] = 'stopped';
                    readinessMap[agent.id] = false;
                    deviceTypeMap[agent.id] = 'cpu';
                }
            } catch (error) {
                console.error(`[DEBUG] Error fetching status for agent ${agent.id}:`, error);
                statusMap[agent.id] = 'error';
                readinessMap[agent.id] = false;
                deviceTypeMap[agent.id] = 'cpu';
            }
        }
        
        // Update states with new data
        setAgentStatuses(prev => ({ ...prev, ...statusMap }));
        setAgentReadiness(prev => ({ ...prev, ...readinessMap }));
        setAgentDeviceTypes(prev => ({ ...prev, ...deviceTypeMap }));
    }, [agents]);

    const runAgent = useCallback(async (agent, isManualCapture = false) => {
        // For interval mode agents, check if paused. Manual capture agents can always run
        if (agent.paused && !isManualCapture) {
            console.log(`[DEBUG] runAgent: Agent ${agent.id} is paused. Skipping execution.`);
            return;
        }
        
        // Check if agent is ready for inference - refresh status first
        await refreshAgentStatuses(agent.id);
        if (!agentReadiness[agent.id]) {
            console.log(`[DEBUG] runAgent: Agent ${agent.id} is not ready yet. Skipping execution.`);
            return;
        }
        
        // Check if agent is already processing - skip if so to prevent overload
        if (agentProcessing[agent.id]) {
            console.log(`[DEBUG] runAgent: Agent ${agent.id} is already processing. Skipping this interval to prevent overload.`);
            return;
        }
        
        console.log(`[DEBUG] runAgent: Running for agent ${agent.id}`);

        const startTime = Date.now();
        setAgentProcessing(prev => ({ ...prev, [agent.id]: true }));
        setHighlightedAgentId(agent.id);
        
        // Start timer for UI display
        setAgentTimers(prev => ({ ...prev, [agent.id]: { startTime, currentTime: 0 } }));
        
        // Update timer every second for UI
        const timerInterval = setInterval(() => {
            setAgentTimers(prev => {
                if (prev[agent.id]) {
                    return {
                        ...prev,
                        [agent.id]: {
                            ...prev[agent.id],
                            currentTime: Math.floor((Date.now() - prev[agent.id].startTime) / 1000)
                        }
                    };
                }
                return prev;
            });
        }, 1000);

        try {
            const result = await handleSendImageToAgent(agent);
            
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            
            console.log(`[DEBUG] runAgent: Result for agent ${agent.id}:`, result);
            console.log(`[DEBUG] runAgent: Processing time for agent ${agent.id}: ${processingTime}ms`);

            // Update processing statistics
            setImageProcessingStats(prev => {
                const agentStats = prev[agent.id] || { avgProcessTime: 0, errorCount: 0, totalRuns: 0 };
                const newTotalRuns = agentStats.totalRuns + 1;
                const newAvgProcessTime = ((agentStats.avgProcessTime * agentStats.totalRuns) + processingTime) / newTotalRuns;
                
                return {
                    ...prev,
                    [agent.id]: {
                        lastProcessTime: processingTime,
                        avgProcessTime: Math.round(newAvgProcessTime),
                        errorCount: result.error ? agentStats.errorCount + 1 : agentStats.errorCount,
                        totalRuns: newTotalRuns,
                        lastUpdate: endTime
                    }
                };
            });

            setAgentResults(prev => ({ ...prev, [agent.id]: result.resultText }));
            setAgentErrors(prev => ({ ...prev, [agent.id]: result.error }));

            if (!result.error) {
                console.log(`[DEBUG] runAgent: Agent ${agent.id} processed successfully. Adding new detection.`);
                const newDetection = {
                    id: Date.now() + Math.random(),
                    agentId: result.agentId,
                    agentName: result.agentName,
                    text: result.resultText,
                    lastUpdate: Date.now(),
                    processingTime: processingTime,
                    imageData: result.imageData,  // Include image data
                    isError: false
                };
                addDetection(newDetection);
                
                // Auto-speak if TTS is enabled for this agent
                if (agent.enableTTS && result.resultText) {
                    speakText(result.resultText, newDetection.id, agent.label);
                }
            } else {
                console.error(`[DEBUG] runAgent: Agent ${agent.id} failed. Error: ${result.error}`);
                // Add error to Active Detections for better UX
                const errorDetection = {
                    id: Date.now() + Math.random(),
                    agentId: result.agentId,
                    agentName: result.agentName,
                    text: `❌ Error: ${result.error}`,
                    lastUpdate: Date.now(),
                    processingTime: processingTime,
                    imageData: result.imageData,  // Include image data for errors too
                    isError: true
                };
                addDetection(errorDetection);
            }
        } catch (error) {
            console.error(`[DEBUG] runAgent: Unexpected error for agent ${agent.id}:`, error);
            const unexpectedError = `Unexpected error: ${error.message}`;
            setAgentErrors(prev => ({ ...prev, [agent.id]: unexpectedError }));
            
            // Add unexpected error to Active Detections too
            const errorDetection = {
                id: Date.now() + Math.random(),
                agentId: agent.id,
                agentName: agent.label,
                text: `💥 Unexpected Error: ${error.message}`,
                lastUpdate: Date.now(),
                processingTime: Date.now() - startTime,
                imageData: null,  // No image data for unexpected errors
                isError: true
            };
            addDetection(errorDetection);
        } finally {
            // Clear timer interval
            clearInterval(timerInterval);
            
            // Reset timer state
            setAgentTimers(prev => {
                const newTimers = { ...prev };
                delete newTimers[agent.id];
                return newTimers;
            });
            
            setAgentProcessing(prev => ({ ...prev, [agent.id]: false }));
            
            // Clear pending pause state when processing completes
            setAgentPendingPause(prev => ({ ...prev, [agent.id]: false }));
            
            // Reset countdown after processing completes (only for interval mode)
            if (agent.captureMode !== 'manual') {
                setAgentCountdowns(prev => ({ ...prev, [agent.id]: agent.interval }));
            }
            
            setTimeout(() => setHighlightedAgentId(null), 500);
        }
    }, [t, agentProcessing, agentReadiness, speakText, refreshAgentStatuses]); // Include speakText and refreshAgentStatuses in dependencies


    // Effect to manage agent intervals
    useEffect(() => {
        console.log("[DEBUG] Agent interval effect triggered. Current agents:", agents);
        
        const activeAgents = agents.filter(agent => !agent.paused);
        const pausedAgents = agents.filter(agent => agent.paused);

        // Clear intervals for agents that no longer exist
        Object.keys(agentIntervals.current).forEach(agentId => {
            const agentExists = agents.some(agent => agent.id === agentId);
            if (!agentExists) {
                console.log(`[DEBUG] Clearing interval for deleted agent ${agentId}.`);
                clearInterval(agentIntervals.current[agentId]);
                delete agentIntervals.current[agentId];
                // Clear countdown for deleted agents
                setAgentCountdowns(prev => {
                    const newCountdowns = { ...prev };
                    delete newCountdowns[agentId];
                    return newCountdowns;
                });
            }
        });

        // Start intervals for active agents that are ready
        activeAgents.forEach(agent => {
            const isReady = agentReadiness[agent.id] || false;
            const isIntervalMode = agent.captureMode !== 'manual';
            
            if (!agentIntervals.current[agent.id] && agent.interval > 0 && isReady && isIntervalMode) {
                console.log(`[DEBUG] Setting up interval for agent ${agent.id} every ${agent.interval} seconds.`);
                
                // Initialize countdown for this agent
                setAgentCountdowns(prev => ({ ...prev, [agent.id]: agent.interval }));
                
                agentIntervals.current[agent.id] = setInterval(() => {
                    console.log(`[DEBUG] Interval fired for agent ${agent.id}.`);
                    // Only run if not currently processing
                    if (!agentProcessing[agent.id]) {
                        runAgent(agent);
                        // Reset countdown after processing starts
                        setAgentCountdowns(prev => ({ ...prev, [agent.id]: agent.interval }));
                    } else {
                        console.log(`[DEBUG] Agent ${agent.id} is processing, skipping interval execution.`);
                    }
                }, agent.interval * 1000);
                
                // Run once immediately on resume only if ready
                console.log(`[DEBUG] Running agent ${agent.id} immediately after unpausing.`);
                runAgent(agent);
            } else if (!isReady && agent.interval > 0 && isIntervalMode) {
                console.log(`[DEBUG] Agent ${agent.id} is not ready yet (ready: ${isReady}), skipping interval setup.`);
            } else if (!isIntervalMode) {
                console.log(`[DEBUG] Agent ${agent.id} is in manual capture mode, skipping interval setup.`);
            }
        });

        // Clear intervals for paused agents
        pausedAgents.forEach(agent => {
            if (agentIntervals.current[agent.id]) {
                console.log(`[DEBUG] Clearing interval for paused agent ${agent.id}.`);
                clearInterval(agentIntervals.current[agent.id]);
                delete agentIntervals.current[agent.id];
                // Clear countdown for paused agents
                setAgentCountdowns(prev => {
                    const newCountdowns = { ...prev };
                    delete newCountdowns[agent.id];
                    return newCountdowns;
                });
            }
        });

        // Cleanup on unmount
        return () => {
            console.log("[DEBUG] Cleaning up all agent intervals on unmount.");
            Object.values(agentIntervals.current).forEach(clearInterval);
            agentIntervals.current = {};
            setAgentCountdowns({});
        };
    }, [agents, runAgent, agentReadiness]); // Include agentReadiness in dependencies

    // Countdown timer effect - runs every second to update countdown displays
    useEffect(() => {
        const countdownInterval = setInterval(() => {
            setAgentCountdowns(prev => {
                const newCountdowns = { ...prev };
                const currentAgents = agentStore.get();
                let hasChanges = false;
                
                // Decrement countdown for each active agent (only if not processing and in interval mode)
                Object.keys(newCountdowns).forEach(agentId => {
                    const agent = currentAgents.find(a => a.id === agentId);
                    const isIntervalMode = agent && agent.captureMode !== 'manual';
                    
                    if (newCountdowns[agentId] > 0 && !agentProcessing[agentId] && isIntervalMode) {
                        newCountdowns[agentId] -= 1;
                        hasChanges = true;
                    }
                });
                
                return hasChanges ? newCountdowns : prev;
            });
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, [agentProcessing]);


    // Fetch agent statuses from FastAPI - only after initialization is complete
    useEffect(() => {
        async function fetchStatuses() {
            const statusMap = {};
            const readinessMap = {};
            const deviceTypeMap = {};
            
            // Fetch status for each agent from FastAPI
            for (const agent of agents) {
                try {
                    const result = await getAgentStatus(agent.id);
                    if (result.success) {
                        statusMap[agent.id] = result.data.status;
                        readinessMap[agent.id] = result.data.ready || false;
                        deviceTypeMap[agent.id] = result.data.actual_device || 'cpu';
                        
                        // Update memory usage in processing stats and separate state
                        if (result.data.memory_usage_mb) {
                            setImageProcessingStats(prev => ({
                                ...prev,
                                [agent.id]: {
                                    ...prev[agent.id],
                                    memory_usage_mb: result.data.memory_usage_mb
                                }
                            }));
                            setAgentMemoryUsage(prev => ({
                                ...prev,
                                [agent.id]: result.data.memory_usage_mb
                            }));
                        }
                    } else {
                        // If agent doesn't exist in FastAPI, mark as stopped
                        statusMap[agent.id] = 'stopped';
                        readinessMap[agent.id] = false;
                        deviceTypeMap[agent.id] = 'cpu';
                    }
                } catch (error) {
                    console.error(`[DEBUG] Error fetching status for agent ${agent.id}:`, error);
                    statusMap[agent.id] = 'error';
                    readinessMap[agent.id] = false;
                    deviceTypeMap[agent.id] = 'cpu';
                }
            }
            
            setAgentStatuses(statusMap);
            setAgentReadiness(readinessMap);
            setAgentDeviceTypes(deviceTypeMap);
        }
        
        if (agents.length > 0 && initializationComplete) {
            fetchStatuses();
        }
    }, [agents, initializationComplete]);


    return (
        <div className="flex flex-col h-screen relative">
            <div className="flex flex-1 overflow-hidden">
                <div className="w-3/5 h-full flex flex-col items-center justify-start pl-4 pr-4 pb-4">
                    <Card className="w-full h-1/2 flex flex-col items-center justify-center">
                        <CardHeader className="flex flex-row items-center justify-between w-full">
                            <CardTitle>{t("Home:webcam")}</CardTitle>
                            <Button 
                                size="icon" 
                                variant="ghost" 
                                title={t('Home:refreshWebcam')} 
                                onClick={checkWebcam}
                            >
                                <ReloadIcon className="w-5 h-5" />
                            </Button>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center h-full">
                            {webcamAvailable ? (
                                <>
                                    <Webcam
                                        ref={webcamRef}
                                        audio={false}
                                        width={320}
                                        height={240}
                                        screenshotFormat="image/jpeg"
                                        videoConstraints={{ deviceId: selectedVideoDevice }}
                                        onUserMediaError={() => setWebcamAvailable(false)}
                                    />
                                    {/* Always show dropdown if there are multiple devices */}
                                    {videoDevices.length > 1 && (
                                        <Select
                                            value={selectedVideoDevice}
                                            onValueChange={value => {
                                                setSelectedVideoDevice(value);
                                                setWebcamAvailable(true);
                                            }}
                                        >
                                            <SelectTrigger className="w-48 mt-2">
                                                <SelectValue placeholder={t('Home:selectWebcam')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {videoDevices.map(device => (
                                                    <SelectItem key={device.deviceId} value={device.deviceId}>
                                                        {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </>
                            ) : (
                                <>

                                    <div className="flex flex-col items-center text-red-500 mt-2">
                                        <ExclamationTriangleIcon className="w-8 h-8 mb-2" />
                                        <span>{checkingWebcam ? t("Home:checkingWebcam") : t("Home:noWebcam")}</span>
                                    </div>

                                    {videoDevices.length > 1 && (
                                        <Select
                                            value={selectedVideoDevice}
                                            onValueChange={value => {
                                                setSelectedVideoDevice(value);
                                                setWebcamAvailable(true);
                                            }}
                                        >
                                            <SelectTrigger className="w-48 mt-2">
                                                <SelectValue placeholder={t('Home:selectWebcam')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {videoDevices.map(device => (
                                                    <SelectItem key={device.deviceId} value={device.deviceId}>
                                                        {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}

                                </>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="w-full mt-4">
                        <CardHeader className="pb-3">
                            <CardTitle>{t("Home:activeDetections")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-2 pt-0">
                            {activeDetections?.length > 0 ? (
                                <List
                                    height={260}
                                    itemCount={activeDetections.length}
                                    itemSize={40}
                                    width={"100%"}
                                    className="text-xs border rounded"
                                >
                                    {({ index, style }) => {
                                        const entry = activeDetections[index];
                                        const isError = entry.isError;
                                        return (
                                            <div 
                                                style={style} 
                                                key={entry.id} 
                                                className={`flex items-center gap-2 px-2 py-1 border-b last:border-b-0 cursor-pointer ${
                                                    isError ? 'bg-red-50 border-red-200 hover:bg-red-100' : 'hover:bg-gray-50'
                                                }`}
                                                onClick={() => setDetectionDialog({
                                                    open: true, 
                                                    content: entry.text, 
                                                    agentName: entry.agentName || `${t("Home:agent")} ${entry.agentId}`,
                                                    agentId: entry.agentId,
                                                    imageData: entry.imageData || null,
                                                    timestamp: entry.lastUpdate,
                                                    processingTime: entry.processingTime,
                                                    memoryUsage: agentMemoryUsage[entry.agentId] || imageProcessingStats[entry.agentId]?.memory_usage_mb
                                                })}
                                            >
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                                    isError 
                                                        ? 'bg-red-100 text-red-800' 
                                                        : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {entry.agentName || `${t("Home:agent")} ${entry.agentId}`}
                                                </span>
                                                <span className={`truncate flex-1 ${
                                                    isError ? 'text-red-700 font-medium' : 'text-gray-700'
                                                }`}>
                                                    <ReactMarkdown 
                                                        components={{
                                                            // Simple inline formatting only
                                                            p: ({children}) => <span>{children}</span>,
                                                            strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                                                            em: ({children}) => <em className="italic">{children}</em>,
                                                            code: ({children}) => <code className="bg-gray-100 px-1 rounded text-xs">{children}</code>,
                                                        }}
                                                    >
                                                        {entry.text.length > 128 ? entry.text.substring(0, 128) + '...' : entry.text}
                                                    </ReactMarkdown>
                                                </span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 w-6 p-0 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Stop TTS if this detection is currently being spoken
                                                        if (currentSpeech === entry.id) {
                                                            stopSpeech();
                                                        }
                                                        removeDetection(entry.id);
                                                    }}
                                                >
                                                    {t('Home:deleteDetection')}
                                                </Button>
                                            </div>
                                        );
                                    }}
                                </List>
                            ) : (
                                <div className="text-center text-sm text-muted-foreground p-6 bg-gray-50 rounded border-2 border-dashed border-gray-200">
                                    <div className="mb-1">📊 {t("Home:noDetections")}</div>
                                    <div className="text-xs text-gray-400">{t('Home:startAgentMessage')}</div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>


                <aside className="w-2/5 border-l bg-white p-4 flex flex-col rounded-lg shadow-sm" style={{height: 'calc(100vh - 10rem)', overflowY: 'auto'}}>
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-lg text-black">🤖 {t("Home:agents")}</h2>
                            {agents && agents.length > 0 && (
                                <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                    {agents.length}
                                </span>
                            )}
                        </div>
                        <Button 
                            size="sm" 
                            variant="outline" 
                            title={t("Home:addAgent")}
                            onClick={() => setAgentDialogOpen(true)}
                            className="flex items-center gap-1 text-xs bg-white text-black border-gray-300 shadow-md hover:shadow-lg hover:bg-gray-50 font-medium"
                        >
                            <PlusIcon className="w-4 h-4 text-black" />
                            Add Agent
                        </Button>
                        <PersonaForm
                            open={agentDialogOpen}
                            onOpenChange={setAgentDialogOpen}
                            editMode={false}
                        />
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto">
                        {(!agents || agents.length === 0) && (
                            <div className="text-muted-foreground text-sm text-center mt-8 p-6 bg-gray-50 rounded border-2 border-dashed border-gray-200">
                                <div className="mb-1">🤖 {t("Home:noAgents")}</div>
                                <div className="text-xs text-gray-400">Click the + button to create your first agent</div>
                            </div>
                        )}
                        {(agents || []).map(agent => {
                            const status = agentStatuses[agent.id] || 'unknown';
                            const isReady = agentReadiness[agent.id] || false;
                            const statusColor =
                                status === 'running' && isReady ? 'bg-green-500' :
                                status === 'running' && !isReady ? 'bg-orange-500' :
                                status === 'loading' ? 'bg-blue-500' :
                                status === 'paused' || status === 'stopped' ? 'bg-yellow-500' :
                                status === 'error' ? 'bg-red-500' : 'bg-gray-400';
                            const cardBorder = status === 'error' ? 'border-2 border-red-500' : '';
                            
                            const isProcessing = agentProcessing[agent.id];
                            const isPendingPause = agentPendingPause[agent.id];
                            const countdown = agentCountdowns[agent.id];
                            const showCountdown = !agent.paused && countdown !== undefined && countdown > 0 && isReady;

                            return (
                                <Card key={agent.id} className={`mb-3 transition-all duration-300 shadow-md hover:shadow-lg bg-white ${highlightedAgentId === agent.id ? 'border-2 border-blue-500 shadow-lg' : 'border border-gray-200'} ${cardBorder}`}>
                                    <CardHeader className="flex flex-row items-center justify-between p-3 pb-2">
                                        <CardTitle className="text-sm text-black flex items-center gap-2 flex-1 min-w-0">
                                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor}`}></span>
                                            <span className="truncate font-medium">{agent.label}</span>
                                            <div className="flex gap-1 ml-auto flex-shrink-0">
                                                {status === 'running' && !isReady && (
                                                    <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-md font-medium">
                                                        Loading
                                                    </span>
                                                )}
                                                {isPendingPause && isProcessing && (
                                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-md font-medium animate-pulse">
                                                        {t('Home:pausingAfterProcessing')}
                                                    </span>
                                                )}
                                                {isProcessing && !isPendingPause && (
                                                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-medium animate-pulse">
                                                        Processing {agentTimers[agent.id]?.currentTime ? `${agentTimers[agent.id].currentTime}s` : ''}
                                                    </span>
                                                )}
                                                {showCountdown && !isPendingPause && (
                                                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md font-medium">
                                                        {countdown}s
                                                    </span>
                                                )}
                                            </div>
                                        </CardTitle>
                                        <div className="flex gap-1 ml-2">
                                            <Button 
                                                size="sm" 
                                                variant="ghost" 
                                                title={isProcessing ? t('Home:cannotEditWhileProcessing') : t("Home:editAgent")}
                                                onClick={() => isProcessing ? null : setEditAgentId(agent.id)}
                                                disabled={isProcessing}
                                                className="h-7 w-7 p-0"
                                            >
                                                <Pencil2Icon className={`w-3.5 h-3.5 ${isProcessing ? "text-gray-400" : "text-gray-600 hover:text-black"}`} />
                                            </Button>
                                            <Button 
                                                size="sm" 
                                                variant="ghost" 
                                                title={t("Home:removeAgent")} 
                                                onClick={() => handleRemoveAgent(agent)}
                                                disabled={agentRemoving[agent.id]}
                                                className="h-7 w-7 p-0"
                                            >
                                                {agentRemoving[agent.id] ? (
                                                    <ExclamationTriangleIcon className="animate-spin w-3.5 h-3.5 text-gray-600" />
                                                ) : (
                                                    <TrashIcon className="w-3.5 h-3.5 text-gray-600 hover:text-red-600" />
                                                )}
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0 space-y-2">
                                        <p className="text-xs text-gray-600 leading-relaxed">{agent.description}</p>
                                        <div className="flex items-center gap-2">
                                            {agent.captureMode === 'manual' ? (
                                                // Manual capture mode - show capture button
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleManualCapture(agent)}
                                                    disabled={!webcamAvailable || isProcessing}
                                                    className="h-7 px-2 text-xs"
                                                >
                                                    {isProcessing ? (
                                                        <>
                                                            <ReloadIcon className="w-3 h-3 mr-1 animate-spin" />
                                                            {t('Home:capturing')}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <PlayIcon className="w-3 h-3 mr-1" />
                                                            {t('Home:captureFrame')}
                                                        </>
                                                    )}
                                                </Button>
                                            ) : (
                                                // Interval mode - show pause/resume button
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => toggleAgentPause(agent)}
                                                    title={
                                                        isPendingPause 
                                                            ? t("Home:pausePendingTooltip")
                                                            : agent.paused 
                                                                ? t("resume") 
                                                                : isProcessing 
                                                                    ? t("Home:pauseProcessingTooltip")
                                                                    : t("pause")
                                                    }
                                                    disabled={!webcamAvailable}
                                                    className={`h-7 px-2 text-xs ${isPendingPause ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : ''}`}
                                                >
                                                    {isPendingPause ? (
                                                        <>
                                                            <ClockIcon className="w-3 h-3 mr-1" />
                                                            {t('Home:pausePending')}
                                                        </>
                                                    ) : agent.paused ? (
                                                        <>
                                                            <PlayIcon className="w-3 h-3 mr-1" />
                                                            Resume
                                                        </>
                                                    ) : (
                                                        <>
                                                            <PauseIcon className="w-3 h-3 mr-1" />
                                                            Pause
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                            {/* Show interval info only for interval mode and when not paused/processing */}
                                            {agent.captureMode !== 'manual' && !agent.paused && !isProcessing && (
                                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                                    Every {agent.interval}s
                                                </span>
                                            )}
                                        </div>
                                        {/* Latest Result removed per user request */}
                                        
                                        {/* Device and Performance Info */}
                                        <div className="mt-2 space-y-2">
                                            {/* Device and Memory Badges */}
                                            {agentStatuses[agent.id] && (
                                                <div className="flex gap-1 flex-wrap">
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium">
                                                        🖥️ {agentDeviceTypes[agent.id] === 'cuda' ? t('Home:gpu') : t('Home:cpu')}
                                                    </span>
                                                    {/* Only show RAM badge when agent is running and has real memory usage data */}
                                                    {(agentMemoryUsage[agent.id] || imageProcessingStats[agent.id]?.memory_usage_mb) && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium">
                                                            💾 {Math.round(agentMemoryUsage[agent.id] || imageProcessingStats[agent.id].memory_usage_mb)}{t('Home:memoryUnit')}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                    {editAgentId === agent.id && (
                                        <PersonaForm
                                            open={true}
                                            onOpenChange={setEditAgentId}
                                            persona={agent}
                                            editMode={true}
                                            agentId={agent.id}
                                        />
                                    )}
                                </Card>
                            )
                        })}
                    </div>
                </aside>

                {/* activeDetections section removed from bottom */}
            </div>
            
            {/* Detection Dialog for viewing full text and image */}
            <Dialog 
                open={detectionDialog.open} 
                onOpenChange={(open) => {
                    if (!open) stopSpeech(); // Stop TTS when dialog closes
                    setDetectionDialog({...detectionDialog, open});
                }}
            >
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
                    <DialogHeader className="border-b border-gray-200 pb-4">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-xl font-semibold text-gray-900">
                                {t('Home:detectionResult')} - {detectionDialog.agentName}
                            </DialogTitle>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={`flex items-center gap-2 ${
                                        isSpeaking ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100' : 'hover:bg-blue-50'
                                    }`}
                                    onClick={() => speakText(detectionDialog.content, 'dialog', detectionDialog.agentName)}
                                    disabled={!detectionDialog.content}
                                >
                                    {isSpeaking ? '🔇' : '🔊'}
                                    {isSpeaking ? t('Home:stop') : t('Home:speak')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={`flex items-center gap-2 ${
                                        isCopied ? 'bg-green-50 border-green-300 text-green-700' : 'hover:bg-gray-50'
                                    }`}
                                    onClick={() => copyToClipboard(detectionDialog.content)}
                                    disabled={!detectionDialog.content}
                                >
                                    {isCopied ? '✅' : '📋'}
                                    {isCopied ? t('Home:copied') : t('Home:copy')}
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>
                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Image Panel */}
                        {detectionDialog.imageData && (
                            <div className="space-y-3">
                                <h3 className="font-semibold text-base text-gray-800 border-b border-gray-300 pb-2">
                                    📸 {t('Home:processedImage')}
                                </h3>
                                <div className="border-2 border-gray-200 rounded-lg p-3 bg-gray-50 shadow-sm">
                                    <img 
                                        src={detectionDialog.imageData} 
                                        alt={t('Home:processedWebcamImage')} 
                                        className="w-full h-auto rounded-md shadow-sm"
                                        style={{ maxHeight: '400px', objectFit: 'contain' }}
                                    />
                                </div>
                            </div>
                        )}
                        
                        {/* Text Panel */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-base text-gray-800 border-b border-gray-300 pb-2">
                                🔍 {t('Home:analysisResult')}
                            </h3>
                            <div className="p-4 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm leading-relaxed shadow-sm" 
                                 style={{ minHeight: '200px', maxHeight: '400px', overflowY: 'auto' }}>
                                <ReactMarkdown 
                                    className="text-gray-800 prose prose-sm max-w-none"
                                    components={{
                                        // Custom styling for markdown elements
                                        strong: ({children}) => <strong className="font-semibold text-gray-900">{children}</strong>,
                                        em: ({children}) => <em className="italic text-gray-700">{children}</em>,
                                        code: ({children}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                                        p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                                        ul: ({children}) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                                        ol: ({children}) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                                        li: ({children}) => <li className="mb-1">{children}</li>,
                                        h1: ({children}) => <h1 className="text-lg font-bold mb-2 text-gray-900">{children}</h1>,
                                        h2: ({children}) => <h2 className="text-base font-semibold mb-2 text-gray-800">{children}</h2>,
                                        h3: ({children}) => <h3 className="text-sm font-medium mb-1 text-gray-700">{children}</h3>,
                                        blockquote: ({children}) => <blockquote className="border-l-4 border-blue-200 pl-3 italic text-gray-600 mb-2">{children}</blockquote>
                                    }}
                                >
                                    {detectionDialog.content}
                                </ReactMarkdown>
                            </div>
                            
                            {/* Metadata Stats */}
                            <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                                <h4 className="font-semibold text-sm text-blue-800 mb-3 border-b border-blue-300 pb-2">
                                    📊 {t('Home:processingDetails')}
                                </h4>
                                <div className="grid grid-cols-1 gap-2 text-xs">
                                    {detectionDialog.agentName && (
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-blue-700">🤖 {t('Home:agentLabel')}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-blue-600">
                                                    {detectionDialog.agentName}
                                                </span>
                                                {detectionDialog.agentId && agents.find(a => a.id === detectionDialog.agentId) && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 px-2 text-xs text-blue-600 border-blue-300 hover:bg-blue-50"
                                                        onClick={() => handleViewAgent(detectionDialog.agentId)}
                                                    >
                                                        {t('Home:viewAgent')}
                                                    </Button>
                                                )}
                                                {detectionDialog.agentId && !agents.find(a => a.id === detectionDialog.agentId) && (
                                                    <span className="text-xs text-gray-500 italic">
                                                        {t('Home:agentDeleted')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {detectionDialog.timestamp && (
                                        <div className="flex justify-between">
                                            <span className="font-medium text-blue-700">📅 {t('Home:captured')}</span>
                                            <span className="text-blue-600">
                                                {new Date(detectionDialog.timestamp).toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                    {detectionDialog.processingTime && (
                                        <div className="flex justify-between">
                                            <span className="font-medium text-blue-700">⚡ {t('Home:processingTime')}</span>
                                            <span className="text-blue-600">
                                                {(detectionDialog.processingTime / 1000).toFixed(2)}{t('Home:timeUnit')}
                                            </span>
                                        </div>
                                    )}
                                    {detectionDialog.memoryUsage && (
                                        <div className="flex justify-between">
                                            <span className="font-medium text-blue-700">💾 {t('Home:ramUsage')}</span>
                                            <span className="text-blue-600">
                                                {Math.round(detectionDialog.memoryUsage)}{t('Home:memoryUnit')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            
            {/* Audio Settings Footer */}
            <div className="w-full flex items-center justify-center py-2">
                <Dialog open={audioSettingsOpen} onOpenChange={setAudioSettingsOpen}>
                    <DialogTrigger asChild>
                        <Button 
                            variant="outline" 
                            size="sm"
                            className="flex items-center gap-2 hover:bg-gray-100"
                        >
                            🔊 {t('Home:audioSettings')}
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md bg-white border border-black">
                        <DialogHeader>
                            <DialogTitle>{t('Home:voiceSettings')}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6 mt-4">
                            {/* Voice Selection */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('Home:voice')}</label>
                                <Select
                                    value={audioSettings.voice?.name || ''}
                                    onValueChange={(voiceName) => {
                                        const voice = availableVoices.find(v => v.name === voiceName);
                                        setAudioSettings(prev => ({ ...prev, voice }));
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('Home:selectVoice')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableVoices.map(voice => (
                                            <SelectItem key={voice.name} value={voice.name}>
                                                {voice.name} ({voice.lang})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Speech Rate */}
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium">{t('Home:speechRate')}</label>
                                    <span className="text-sm text-gray-500">{audioSettings.rate.toFixed(1)}x</span>
                                </div>
                                <Slider
                                    value={[audioSettings.rate]}
                                    onValueChange={([value]) => setAudioSettings(prev => ({ ...prev, rate: value }))}
                                    min={0.1}
                                    max={3.0}
                                    step={0.1}
                                    className="w-full"
                                />
                            </div>

                            {/* Speech Pitch */}
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium">{t('Home:speechPitch')}</label>
                                    <span className="text-sm text-gray-500">{audioSettings.pitch.toFixed(1)}</span>
                                </div>
                                <Slider
                                    value={[audioSettings.pitch]}
                                    onValueChange={([value]) => setAudioSettings(prev => ({ ...prev, pitch: value }))}
                                    min={0.0}
                                    max={2.0}
                                    step={0.1}
                                    className="w-full"
                                />
                            </div>

                            {/* Volume */}
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium">{t('Home:speechVolume')}</label>
                                    <span className="text-sm text-gray-500">{Math.round(audioSettings.volume * 100)}%</span>
                                </div>
                                <Slider
                                    value={[audioSettings.volume]}
                                    onValueChange={([value]) => setAudioSettings(prev => ({ ...prev, volume: value }))}
                                    min={0.0}
                                    max={1.0}
                                    step={0.05}
                                    className="w-full"
                                />
                            </div>

                            {/* Test Voice Button */}
                            <div className="pt-4 border-t">
                                <Button 
                                    onClick={() => speakText(t('Home:testText'), 'test', t('Home:audioSettings'))}
                                    disabled={isSpeaking || !audioSettings.voice}
                                    className="w-full"
                                    variant="outline"
                                >
                                    {isSpeaking ? '🔇 Speaking...' : `🔊 ${t('Home:testVoice')}`}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            
            {/* View Agent Dialog */}
            {viewAgentData && (
                <PersonaForm
                    open={viewAgentDialogOpen}
                    onOpenChange={setViewAgentDialogOpen}
                    persona={viewAgentData}
                    viewOnly={true}
                />
            )}
        </div>
    );
}