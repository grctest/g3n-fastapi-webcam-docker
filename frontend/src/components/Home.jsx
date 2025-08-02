// ...existing code...

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "@nanostores/react";
import Webcam from "react-webcam";
import { useTranslation } from "react-i18next";

import { ExclamationTriangleIcon, PlusIcon, TrashIcon, Pencil2Icon, PauseIcon, PlayIcon, ReloadIcon } from "@radix-ui/react-icons";
import { FixedSizeList as List } from 'react-window';


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

import { i18n as i18nInstance, locale } from "@/lib/i18n.js";
import { agentStore } from "../stores/agentStore";

import { PersonaForm } from './PersonaForm';
import { initializeAgent, getAgentStatus, processImage, shutdownAgent } from '../lib/api.js';
import { compressImage, getImageMetadata } from '../lib/imageUtils.js';

export default function Home() {
    const { toast } = useToast();
    const { t, i18n } = useTranslation(locale.get(), { i18n: i18nInstance });
    const agents = useStore(agentStore);

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
    const [videoDevices, setVideoDevices] = useState([]);
    const [selectedVideoDevice, setSelectedVideoDevice] = useState("");

    const webcamRef = useRef(null);
    const agentIntervals = useRef({});
    const [webcamAvailable, setWebcamAvailable] = useState(false);
    const [checkingWebcam, setCheckingWebcam] = useState(false);
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

            if (agents && agents.length > 0) {
                console.log(`[DEBUG] Found ${agents.length} agents in store. Initializing via FastAPI...`);
                
                // Initialize each agent via FastAPI
                for (const agent of agents) {
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
                
                // Set all agents to paused in the UI after initialization
                const pausedAgents = agents.map(agent => ({ ...agent, paused: true }));
                agentStore.set(pausedAgents);
                console.log("[DEBUG] All agents set to paused state in UI.");
                
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

    const [activeDetections, setActiveDetections] = useState([]);

    const handleRemoveAgent = async (agent) => {
        console.log(`[DEBUG] Removing agent ${agent.id} (${agent.label})`);
        
        // Set loading state
        setAgentRemoving(prev => ({ ...prev, [agent.id]: true }));
        
        try {
            // First, shutdown the agent via FastAPI
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

        // TODO: Implement FastAPI endpoint calls for agent pause/resume
        // Note: For now, pausing/resuming is handled locally via UI state
        
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
            
            // Compress image for more efficient upload (reduce to max 800x600, 80% quality)
            const compressedImage = await compressImage(screenshot, 0.8, 800, 600);
            const compressedMetadata = await getImageMetadata(compressedImage);
            console.log(`[DEBUG] Compressed image metadata:`, compressedMetadata);
            console.log(`[DEBUG] Size reduction: ${originalMetadata.sizeInKB}KB -> ${compressedMetadata.sizeInKB}KB (${Math.round((1 - compressedMetadata.sizeInKB / originalMetadata.sizeInKB) * 100)}% reduction)`);
            
            screenshot = compressedImage;
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
                    error: null
                };
            } else {
                const errorMsg = response?.error || t('visionModelFailed');
                console.error(`[DEBUG] handleSendImageToAgent: FastAPI failed to process image for agent ${agent.id}. Error: ${errorMsg}`);
                return {
                    agentId: agent.id,
                    agentName: agent.label,
                    resultText: errorMsg,
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
                error: errorMsg
            };
        }
    };

    const MAX_DETECTIONS = 100;

    const runAgent = useCallback(async (agent) => {
        if (agent.paused) {
            console.log(`[DEBUG] runAgent: Agent ${agent.id} is paused. Skipping execution.`);
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
                processingTime: processingTime
            };
            setActiveDetections(prev => [newDetection, ...prev].slice(0, MAX_DETECTIONS));
        } else {
            console.error(`[DEBUG] runAgent: Agent ${agent.id} failed. Error: ${result.error}`);
        }

        setAgentProcessing(prev => ({ ...prev, [agent.id]: false }));
        setTimeout(() => setHighlightedAgentId(null), 500);
    }, [t, agentProcessing]);


    // Effect to manage agent intervals
    useEffect(() => {
        console.log("[DEBUG] Agent interval effect triggered. Current agents:", agents);
        
        const activeAgents = agents.filter(agent => !agent.paused);
        const pausedAgents = agents.filter(agent => agent.paused);

        // Start intervals for active agents
        activeAgents.forEach(agent => {
            if (!agentIntervals.current[agent.id] && agent.interval > 0) {
                console.log(`[DEBUG] Setting up interval for agent ${agent.id} every ${agent.interval} seconds.`);
                
                // Initialize countdown for this agent
                setAgentCountdowns(prev => ({ ...prev, [agent.id]: agent.interval }));
                
                agentIntervals.current[agent.id] = setInterval(() => {
                    console.log(`[DEBUG] Interval fired for agent ${agent.id}.`);
                    runAgent(agent);
                    // Reset countdown
                    setAgentCountdowns(prev => ({ ...prev, [agent.id]: agent.interval }));
                }, agent.interval * 1000);
                
                // Run once immediately on resume
                console.log(`[DEBUG] Running agent ${agent.id} immediately after unpausing.`);
                runAgent(agent);
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
    }, [agents, runAgent]);

    // Countdown timer effect - runs every second to update countdown displays
    useEffect(() => {
        const countdownInterval = setInterval(() => {
            setAgentCountdowns(prev => {
                const newCountdowns = { ...prev };
                let hasChanges = false;
                
                // Decrement countdown for each active agent
                Object.keys(newCountdowns).forEach(agentId => {
                    if (newCountdowns[agentId] > 0) {
                        newCountdowns[agentId] -= 1;
                        hasChanges = true;
                    }
                });
                
                return hasChanges ? newCountdowns : prev;
            });
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, []);


    // Fetch agent statuses from FastAPI
    useEffect(() => {
        async function fetchStatuses() {
            const statusMap = {};
            
            // Fetch status for each agent from FastAPI
            for (const agent of agents) {
                try {
                    const result = await getAgentStatus(agent.id);
                    if (result.success) {
                        statusMap[agent.id] = result.data.status;
                    } else {
                        // If agent doesn't exist in FastAPI, mark as stopped
                        statusMap[agent.id] = 'stopped';
                    }
                } catch (error) {
                    console.error(`[DEBUG] Error fetching status for agent ${agent.id}:`, error);
                    statusMap[agent.id] = 'error';
                }
            }
            
            setAgentStatuses(statusMap);
        }
        
        if (agents.length > 0) {
            fetchStatuses();
        }
    }, [agents]);


    return (
        <div className="flex flex-col h-screen relative">
            <div className="flex flex-1 overflow-hidden">
                <div className="w-3/5 h-full flex flex-col items-center justify-start p-4 space-y-4">
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
                        <CardHeader>
                            <CardTitle>{t("Home:activeDetections")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-2">
                            {activeDetections?.length > 0 ? (
                                <List
                                    height={120}
                                    itemCount={activeDetections.length}
                                    itemSize={36}
                                    width={"100%"}
                                    className="text-xs"
                                >
                                    {({ index, style }) => {
                                        const entry = activeDetections[index];
                                        return (
                                            <div style={style} key={entry.id} className="flex items-center gap-2 px-2 py-1 border-b last:border-b-0">
                                                <span className="inline-block px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-semibold">
                                                    {entry.agentName || `${t("Home:agent")} ${entry.agentId}`}
                                                </span>
                                                <span className="truncate flex-1">{entry.text}</span>
                                                {entry.processingTime && (
                                                    <span className="text-xs text-gray-500">{entry.processingTime}ms</span>
                                                )}
                                            </div>
                                        );
                                    }}
                                </List>
                            ) : (
                                <div className="text-center text-sm text-muted-foreground p-4">
                                    {t("Home:noDetections")}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>


                <aside className="w-2/5 border-l bg-muted p-4 flex flex-col rounded-lg" style={{height: 'calc(100vh - 10rem)', overflowY: 'auto'}}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold text-black">{t("Home:agents")}</h2>
                        <Button size="icon" variant="outline" title={t("Home:addAgent")}
                            onClick={() => setAgentDialogOpen(true)}>
                            <PlusIcon className="text-black" />
                        </Button>
                        <PersonaForm
                            open={agentDialogOpen}
                            onOpenChange={setAgentDialogOpen}
                            editMode={false}
                        />
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto">
                        {agentErrors.global && (
                            <div className="text-red-500 text-sm text-center mt-2">{agentErrors.global}</div>
                        )}
                        {(!agents || agents.length === 0) && (
                            <div className="text-muted-foreground text-sm text-center mt-8">{t("Home:noAgents")}</div>
                        )}
                        {(agents || []).map(agent => {
                            const status = agentStatuses[agent.id] || 'unknown';
                            const statusColor =
                                status === 'running' ? 'bg-green-500' :
                                status === 'loading' ? 'bg-blue-500' :
                                status === 'paused' || status === 'stopped' ? 'bg-yellow-500' :
                                status === 'error' ? 'bg-red-500' : 'bg-gray-400';
                            const cardBorder = status === 'error' ? 'border-2 border-red-500' : '';
                            
                            const isProcessing = agentProcessing[agent.id];
                            const countdown = agentCountdowns[agent.id];
                            const showCountdown = !agent.paused && countdown !== undefined && countdown > 0;

                            return (
                                <Card key={agent.id} className={`mb-2 transition-all duration-500 ${highlightedAgentId === agent.id ? 'border-2 border-blue-500 shadow-lg' : ''} ${cardBorder}`}>
                                    <CardHeader className="flex flex-row items-center justify-between p-4">
                                        <CardTitle className="text-base text-black flex items-center gap-2">
                                            <span className={`w-3 h-3 rounded-full ${statusColor}`}></span>
                                            {agent.label}
                                            {isProcessing && (
                                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                                    Processing...
                                                </span>
                                            )}
                                            {showCountdown && (
                                                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                                    Next: {countdown}s
                                                </span>
                                            )}
                                        </CardTitle>
                                        <div className="flex gap-2">
                                            <Button size="icon" variant="ghost" title={t("Home:editAgent")}
                                                onClick={() => setEditAgentId(agent.id)}>
                                                <Pencil2Icon className="text-black" />
                                            </Button>
                                            <Button size="icon" variant="ghost" title={t("Home:removeAgent")} 
                                                onClick={() => handleRemoveAgent(agent)}
                                                disabled={agentRemoving[agent.id]}>
                                                {agentRemoving[agent.id] ? (
                                                    <ExclamationTriangleIcon className="animate-spin w-4 h-4 text-black" />
                                                ) : (
                                                    <TrashIcon className="text-black" />
                                                )}
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <p className="text-xs text-black truncate">{agent.description}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                onClick={() => toggleAgentPause(agent)}
                                                title={agent.paused ? t("resume") : t("pause")}
                                                disabled={!webcamAvailable || isProcessing}
                                            >
                                                {agent.paused ? <PlayIcon className="text-black" /> : <PauseIcon className="text-black" />}
                                            </Button>
                                            {isProcessing && (
                                                <span className="ml-2">
                                                    <ExclamationTriangleIcon className="animate-spin w-5 h-5 text-black" />
                                                </span>
                                            )}
                                            {!agent.paused && !isProcessing && (
                                                <span className="text-xs text-gray-600">
                                                    Interval: {agent.interval}s
                                                </span>
                                            )}
                                        </div>
                                        {agentErrors[agent.id] && (
                                            <div className="mt-2 text-xs text-red-500 font-semibold">{agentErrors[agent.id]}</div>
                                        )}
                                        {agentResults[agent.id] && !agentErrors[agent.id] && (
                                            <div className="mt-2 text-xs text-green-500 font-semibold">{t("lastResult")}: {agentResults[agent.id]}</div>
                                        )}
                                        {imageProcessingStats[agent.id] && (
                                            <div className="mt-2 text-xs text-gray-500">
                                                <div>Last: {imageProcessingStats[agent.id].lastProcessTime}ms | Avg: {imageProcessingStats[agent.id].avgProcessTime}ms</div>
                                                <div>Runs: {imageProcessingStats[agent.id].totalRuns} | Errors: {imageProcessingStats[agent.id].errorCount}</div>
                                            </div>
                                        )}
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
            <Toaster />
        </div>
    );
}