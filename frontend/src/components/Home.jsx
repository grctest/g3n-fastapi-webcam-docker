// ...existing code...

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from 'react-markdown';
import EasySpeech from 'easy-speech';
import { useStore } from "@nanostores/react";
import Webcam from "react-webcam";
import { useTranslation } from "react-i18next";

import { ExclamationTriangleIcon, PlusIcon, TrashIcon, Pencil2Icon, PauseIcon, PlayIcon, ReloadIcon } from "@radix-ui/react-icons";
import { FixedSizeList as List } from 'react-window';


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

import { i18n as i18nInstance, locale } from "@/lib/i18n.js";
import { agentStore } from "../stores/agentStore";
import { detectionStore, addDetection, removeDetection, clearAllDetections } from "../stores/detectionStore";

import { PersonaForm } from './PersonaForm';
import { initializeAgent, getAgentStatus, processImage, shutdownAgent, cancelAgentProcessing } from '../lib/api.js';
import { compressImage, getImageMetadata } from '../lib/imageUtils.js';

export default function Home() {
    const { toast } = useToast();
    const { t, i18n } = useTranslation(locale.get(), { i18n: i18nInstance });
    const agents = useStore(agentStore);
    const activeDetections = useStore(detectionStore);

    const [agentProcessing, setAgentProcessing] = useState({}); // { [agentId]: boolean }
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
    const [currentSpeech, setCurrentSpeech] = useState(null); // Track current TTS speech
    const [isSpeaking, setIsSpeaking] = useState(false); // Track if TTS is active

    const webcamRef = useRef(null);
    const agentIntervals = useRef({});
    const [webcamAvailable, setWebcamAvailable] = useState(false);
    const [checkingWebcam, setCheckingWebcam] = useState(false);

    // Initialize EasySpeech on component mount
    useEffect(() => {
        const initSpeech = async () => {
            try {
                await EasySpeech.init();
                console.log('EasySpeech initialized successfully');
            } catch (error) {
                console.error('Failed to initialize EasySpeech:', error);
            }
        };
        initSpeech();
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
    }, [detectionDialog.content, currentSpeech, stopSpeech]);

    // TTS Helper Functions
    const stopSpeech = useCallback(() => {
        if (isSpeaking) {
            EasySpeech.cancel();
            setIsSpeaking(false);
            setCurrentSpeech(null);
        }
    }, [isSpeaking]);

    const speakText = useCallback(async (text, detectionId) => {
        if (isSpeaking) {
            stopSpeech();
            return;
        }

        try {
            setIsSpeaking(true);
            setCurrentSpeech(detectionId);
            
            await EasySpeech.speak({
                text: text.replace(/\*\*/g, '').replace(/\*/g, ''), // Remove markdown formatting
                voice: EasySpeech.voices()[0], // Use default voice
                rate: 1.0,
                pitch: 1.0,
                volume: 1.0,
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
    }, [isSpeaking, stopSpeech]);

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
        // Removed download progress handler as downloads are managed by Docker

        const initializeApp = async () => {
            console.log("[DEBUG] App starting...");

            // FIRST: Clear any existing intervals and reset states
            Object.values(agentIntervals.current).forEach(clearInterval);
            agentIntervals.current = {};
            setAgentProcessing({});
            setAgentCountdowns({});
            setAgentErrors({});
            setAgentResults({});
            clearAllDetections();  // Clear persistent detections on app start
            setAgentTimers({}); // Clear any existing timers
            setAgentMemoryUsage({}); // Clear memory usage state
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
                
                // Check webcam after agent setup
                console.log("[DEBUG] Now checking webcam...");
                await checkWebcam();
            } else {
                console.log("[DEBUG] No agents found in store. Checking webcam directly...");
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
    }, []);

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
                toast({ 
                    title: t("Agent removed successfully"), 
                    description: `Agent "${agent.label}" has been shut down and removed.`
                });
            } else {
                console.warn(`[DEBUG] Agent ${agent.id} shutdown failed, but continuing with removal:`, result.error);
                toast({ 
                    title: t("Agent removed with warning"), 
                    description: `Agent "${agent.label}" removed locally, but shutdown may have failed: ${result.error}`,
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error(`[DEBUG] Error during agent ${agent.id} shutdown:`, error);
            toast({ 
                title: t("Agent removed with error"), 
                description: `Agent "${agent.label}" removed locally, but shutdown failed: ${error.message}`,
                variant: "destructive"
            });
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

        // If pausing and agent is currently processing, cancel the processing first
        if (isPausing && agentProcessing[agent.id]) {
            try {
                console.log(`[DEBUG] Cancelling processing for agent ${agent.id} before pausing`);
                const cancelResult = await cancelAgentProcessing(agent.id);
                if (cancelResult.success) {
                    console.log(`[DEBUG] Processing cancellation requested for agent ${agent.id}`);
                    toast({
                        title: "Processing cancelled",
                        description: `Processing for agent "${agent.label}" has been cancelled and the agent is now paused.`,
                    });
                } else {
                    console.warn(`[DEBUG] Failed to cancel processing for agent ${agent.id}:`, cancelResult.error);
                }
            } catch (error) {
                console.error(`[DEBUG] Error cancelling processing for agent ${agent.id}:`, error);
            }
            
            // Reset processing state immediately
            setAgentProcessing(prev => ({ ...prev, [agent.id]: false }));
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
            const userPrompt = agent.userPrompt || "What do you see in this image?";
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

    const runAgent = useCallback(async (agent) => {
        if (agent.paused) {
            console.log(`[DEBUG] runAgent: Agent ${agent.id} is paused. Skipping execution.`);
            return;
        }
        
        // Check if agent is ready for inference
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
                    speakText(result.resultText, newDetection.id);
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
            
            // Reset countdown after processing completes
            setAgentCountdowns(prev => ({ ...prev, [agent.id]: agent.interval }));
            
            setTimeout(() => setHighlightedAgentId(null), 500);
        }
    }, [t, agentProcessing, agentReadiness]); // Include agentReadiness in dependencies


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
            
            if (!agentIntervals.current[agent.id] && agent.interval > 0 && isReady) {
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
            } else if (!isReady && agent.interval > 0) {
                console.log(`[DEBUG] Agent ${agent.id} is not ready yet (ready: ${isReady}), skipping interval setup.`);
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
                let hasChanges = false;
                
                // Decrement countdown for each active agent (only if not processing)
                Object.keys(newCountdowns).forEach(agentId => {
                    if (newCountdowns[agentId] > 0 && !agentProcessing[agentId]) {
                        newCountdowns[agentId] -= 1;
                        hasChanges = true;
                    }
                });
                
                return hasChanges ? newCountdowns : prev;
            });
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, [agentProcessing]);


    // Fetch agent statuses from FastAPI
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
        
        if (agents.length > 0) {
            fetchStatuses();
        }
    }, [agents]);


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
                                title="Refresh webcam" 
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
                                                <SelectValue placeholder="Select webcam" />
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
                                                <SelectValue placeholder="Select webcam" />
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
                                                    {entry.text}
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
                                                    ×
                                                </Button>
                                            </div>
                                        );
                                    }}
                                </List>
                            ) : (
                                <div className="text-center text-sm text-muted-foreground p-6 bg-gray-50 rounded border-2 border-dashed border-gray-200">
                                    <div className="mb-1">📊 {t("Home:noDetections")}</div>
                                    <div className="text-xs text-gray-400">Start an agent to see analysis results here</div>
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
                                                {isProcessing && (
                                                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-medium animate-pulse">
                                                        Processing {agentTimers[agent.id]?.currentTime ? `${agentTimers[agent.id].currentTime}s` : ''}
                                                    </span>
                                                )}
                                                {showCountdown && (
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
                                                title={isProcessing ? "Cannot edit while processing" : t("Home:editAgent")}
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
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => toggleAgentPause(agent)}
                                                title={agent.paused ? t("resume") : t("pause")}
                                                disabled={!webcamAvailable}
                                                className="h-7 px-2 text-xs"
                                            >
                                                {agent.paused ? (
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
                                            {!agent.paused && !isProcessing && (
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
                                                        🖥️ {agentDeviceTypes[agent.id] === 'cuda' ? 'GPU' : 'CPU'}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium">
                                                        💾 {agentMemoryUsage[agent.id] || imageProcessingStats[agent.id]?.memory_usage_mb 
                                                            ? `${Math.round(agentMemoryUsage[agent.id] || imageProcessingStats[agent.id].memory_usage_mb)}MB`
                                                            : 'Loading...'
                                                        }
                                                    </span>
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
                                Detection Result - {detectionDialog.agentName}
                            </DialogTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                className={`flex items-center gap-2 ${
                                    isSpeaking ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100' : 'hover:bg-blue-50'
                                }`}
                                onClick={() => speakText(detectionDialog.content, 'dialog')}
                                disabled={!detectionDialog.content}
                            >
                                {isSpeaking ? '🔇' : '🔊'}
                                {isSpeaking ? 'Stop' : 'Speak'}
                            </Button>
                        </div>
                    </DialogHeader>
                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Image Panel */}
                        {detectionDialog.imageData && (
                            <div className="space-y-3">
                                <h3 className="font-semibold text-base text-gray-800 border-b border-gray-300 pb-2">
                                    📸 Processed Image
                                </h3>
                                <div className="border-2 border-gray-200 rounded-lg p-3 bg-gray-50 shadow-sm">
                                    <img 
                                        src={detectionDialog.imageData} 
                                        alt="Processed webcam image" 
                                        className="w-full h-auto rounded-md shadow-sm"
                                        style={{ maxHeight: '400px', objectFit: 'contain' }}
                                    />
                                </div>
                            </div>
                        )}
                        
                        {/* Text Panel */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-base text-gray-800 border-b border-gray-300 pb-2">
                                🔍 Analysis Result
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
                                    📊 Processing Details
                                </h4>
                                <div className="grid grid-cols-1 gap-2 text-xs">
                                    {detectionDialog.timestamp && (
                                        <div className="flex justify-between">
                                            <span className="font-medium text-blue-700">📅 Captured:</span>
                                            <span className="text-blue-600">
                                                {new Date(detectionDialog.timestamp).toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                    {detectionDialog.processingTime && (
                                        <div className="flex justify-between">
                                            <span className="font-medium text-blue-700">⚡ Processing Time:</span>
                                            <span className="text-blue-600">
                                                {(detectionDialog.processingTime / 1000).toFixed(2)}s
                                            </span>
                                        </div>
                                    )}
                                    {detectionDialog.memoryUsage && (
                                        <div className="flex justify-between">
                                            <span className="font-medium text-blue-700">💾 RAM Usage:</span>
                                            <span className="text-blue-600">
                                                {Math.round(detectionDialog.memoryUsage)}MB
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            
            <Toaster />
        </div>
    );
}