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
import { downloadStatus } from '../stores/downloadStore';


import { PersonaForm } from './PersonaForm';
import { DownloadManager } from './DownloadManager';

export default function Home() {
    const { toast } = useToast();
    const { t, i18n } = useTranslation(locale.get(), { i18n: i18nInstance });
    const agents = useStore(agentStore);
    const { status: downloadProgressStatus } = useStore(downloadStatus);

    // Block all functionality while downloading
    const isDownloading = downloadProgressStatus === 'downloading';
    const [agentProcessing, setAgentProcessing] = useState({}); // { [agentId]: boolean }

    const [agentErrors, setAgentErrors] = useState({}); // { [agentId]: errorMsg }

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

                if (!hasWebcam) {
                    // Pause all agents in backend
                    if (window.electron?.pauseAllAgents) {
                        await window.electron.pauseAllAgents();
                    }
                }
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
        const handleDownloadProgress = (event, { status, modelId, progress, error }) => {
            console.log(`[DEBUG] Download progress event received:`, { status, modelId, progress, error });
            downloadStatus.set({ status, modelId, progress, error });
        };

        window.electron.onDownloadProgress(handleDownloadProgress);

        const initializeApp = async () => {
            console.log("[DEBUG] App starting...");

            // Don't initialize anything if we're currently downloading
            if (downloadProgressStatus === 'downloading') {
                console.log("[DEBUG] Download in progress, skipping app initialization");
                return;
            }

            if (agents && agents.length > 0) {
                console.log(`[DEBUG] Found ${agents.length} agents in store. Initializing all in backend...`);
                try {
                    const result = await window.electron.initializeAllAgents(agents);
                    if (result.success) {
                        console.log("[DEBUG] All agents successfully initialized in backend.");
                        // Once backend is ready, set all agents to paused in the UI.
                        const pausedAgents = agents.map(agent => ({ ...agent, paused: true }));
                        agentStore.set(pausedAgents);
                        console.log("[DEBUG] All agents set to paused state in UI.");
                        
                        // Only check webcam after successful agent initialization
                        console.log("[DEBUG] Agent initialization complete, now checking webcam...");
                        await checkWebcam();
                    } else {
                        console.error("[DEBUG] Backend failed to initialize all agents:", result.error);
                        // Still check webcam even if agents fail to initialize
                        await checkWebcam();
                    }
                } catch (err) {
                    console.error("[DEBUG] Critical error during bulk agent initialization:", err);
                    // Still check webcam even if agents fail to initialize
                    await checkWebcam();
                }
            } else {
                console.log("[DEBUG] No agents found in store. Checking webcam directly...");
                await checkWebcam();
            }
        };

        initializeApp();

        return () => {
            window.electron.removeDownloadProgressListener(handleDownloadProgress);
        };
    }, []);

    // Watch for download completion to trigger app initialization
    useEffect(() => {
        if (downloadProgressStatus === 'finished') {
            console.log("[DEBUG] Download completed, triggering app initialization...");
            const initializeApp = async () => {
                console.log("[DEBUG] App starting after download completion...");

                if (agents && agents.length > 0) {
                    console.log(`[DEBUG] Found ${agents.length} agents in store. Initializing all in backend...`);
                    try {
                        const result = await window.electron.initializeAllAgents(agents);
                        if (result.success) {
                            console.log("[DEBUG] All agents successfully initialized in backend.");
                            // Once backend is ready, set all agents to paused in the UI.
                            const pausedAgents = agents.map(agent => ({ ...agent, paused: true }));
                            agentStore.set(pausedAgents);
                            console.log("[DEBUG] All agents set to paused state in UI.");
                            
                            // Only check webcam after successful agent initialization
                            console.log("[DEBUG] Agent initialization complete, now checking webcam...");
                            await checkWebcam();
                        } else {
                            console.error("[DEBUG] Backend failed to initialize all agents:", result.error);
                            // Still check webcam even if agents fail to initialize
                            await checkWebcam();
                        }
                    } catch (err) {
                        console.error("[DEBUG] Critical error during bulk agent initialization:", err);
                        // Still check webcam even if agents fail to initialize
                        await checkWebcam();
                    }
                } else {
                    console.log("[DEBUG] No agents found in store. Checking webcam directly...");
                    await checkWebcam();
                }
            };
            initializeApp();
        }
    }, [downloadProgressStatus, agents]);

    const [activeDetections, setActiveDetections] = useState([]);

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

        if (window.electron?.toggleAgentPause) {
            try {
                await window.electron.toggleAgentPause(agent.id, isPausing);
                console.log(`[DEBUG] Notified backend to toggle pause for agent ${agent.id} to ${isPausing}`);
            } catch (err) {
                const errorMsg = 'Failed to update agent pause state in backend.';
                console.error(`[DEBUG] Error toggling pause for agent ${agent.id} in backend:`, err);
                setAgentErrors(prev => ({ ...prev, [agent.id]: errorMsg }));
            }
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
        } catch (e) {
            const errorMsg = t('webcamCaptureError');
            console.error(`[DEBUG] handleSendImageToAgent: Error capturing webcam screenshot for agent ${agent.id}:`, e);
            return { agentId: agent.id, agentName: agent.label, resultText: errorMsg, error: errorMsg };
        }

        try {
            console.log(`[DEBUG] handleSendImageToAgent: Sending webcam image to backend for agent ${agent.id}.`);
            // Corrected call to match the new backend signature
            const response = await window.electron.processImage(agent.id, screenshot);
            console.log(`[DEBUG] handleSendImageToAgent: Received response from backend for agent ${agent.id}:`, response);

            if (response && response.success) {
                return {
                    agentId: agent.id,
                    agentName: agent.label,
                    resultText: response.output,
                    error: null
                };
            } else {
                const errorMsg = response?.error || t('visionModelFailed');
                console.error(`[DEBUG] handleSendImageToAgent: Backend failed to process image for agent ${agent.id}. Error: ${errorMsg}`);
                return {
                    agentId: agent.id,
                    agentName: agent.label,
                    resultText: errorMsg,
                    error: errorMsg
                };
            }
        } catch (err) {
            const errorMsg = t('backendError');
            console.error(`[DEBUG] handleSendImageToAgent: Critical error calling backend for agent ${agent.id}:`, err);
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
        console.log(`[DEBUG] runAgent: Running for agent ${agent.id}`);

        setAgentProcessing(prev => ({ ...prev, [agent.id]: true }));
        setHighlightedAgentId(agent.id);

        const result = await handleSendImageToAgent(agent);
        console.log(`[DEBUG] runAgent: Result for agent ${agent.id}:`, result);

        setAgentResults(prev => ({ ...prev, [agent.id]: result.resultText }));
        setAgentErrors(prev => ({ ...prev, [agent.id]: result.error }));

        if (!result.error) {
            console.log(`[DEBUG] runAgent: Agent ${agent.id} processed successfully. Adding new detection.`);
            const newDetection = {
                id: Date.now() + Math.random(),
                agentId: result.agentId,
                agentName: result.agentName,
                text: result.resultText,
                lastUpdate: Date.now()
            };
            setActiveDetections(prev => [newDetection, ...prev].slice(0, MAX_DETECTIONS));
        } else {
            console.error(`[DEBUG] runAgent: Agent ${agent.id} failed. Error: ${result.error}`);
        }

        setAgentProcessing(prev => ({ ...prev, [agent.id]: false }));
        setTimeout(() => setHighlightedAgentId(null), 500);
    }, [t]);


    // Effect to manage agent intervals
    useEffect(() => {
        console.log("[DEBUG] Agent interval effect triggered. Current agents:", agents);
        
        // Don't start any intervals while downloading
        if (isDownloading) {
            console.log("[DEBUG] Download in progress, not starting agent intervals");
            return;
        }
        
        const activeAgents = agents.filter(agent => !agent.paused);
        const pausedAgents = agents.filter(agent => agent.paused);

        // Start intervals for active agents
        activeAgents.forEach(agent => {
            if (!agentIntervals.current[agent.id] && agent.interval > 0) {
                console.log(`[DEBUG] Setting up interval for agent ${agent.id} every ${agent.interval} seconds.`);
                agentIntervals.current[agent.id] = setInterval(() => {
                    console.log(`[DEBUG] Interval fired for agent ${agent.id}.`);
                    runAgent(agent);
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
            }
        });

        // Cleanup on unmount
        return () => {
            console.log("[DEBUG] Cleaning up all agent intervals on unmount.");
            Object.values(agentIntervals.current).forEach(clearInterval);
            agentIntervals.current = {};
        };
    }, [agents, runAgent, isDownloading]);


    // Fetch agent statuses from backend
    useEffect(() => {
        async function fetchStatuses() {
            if (window.electron?.getAgentStatuses) {
                const statuses = await window.electron.getAgentStatuses();
                setAgentStatuses(statuses);
            }
        }
        fetchStatuses();
    }, [agents]);


    return (
        <div className="flex flex-col h-screen relative">
            {/* Loading overlay while downloading */}
            {isDownloading && (
                <div className="absolute inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg text-center">
                        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-lg font-semibold">Downloading Model...</p>
                        <p className="text-sm text-gray-600">Please wait while the AI model downloads</p>
                    </div>
                </div>
            )}

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
                                disabled={isDownloading}
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
                                                <span className="truncate">{entry.text}</span>
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
                            onClick={() => setAgentDialogOpen(true)}
                            disabled={isDownloading}>
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
                                status === 'running' || status === 'initialized' ? 'bg-green-500' :
                                status === 'paused' ? 'bg-yellow-500' :
                                status === 'error' ? 'bg-red-500' : 'bg-gray-400';
                            const cardBorder = status === 'error' ? 'border-2 border-red-500' : '';

                            return (
                                <Card key={agent.id} className={`mb-2 transition-all duration-500 ${highlightedAgentId === agent.id ? 'border-2 border-blue-500 shadow-lg' : ''} ${cardBorder}`}>
                                    <CardHeader className="flex flex-row items-center justify-between p-4">
                                        <CardTitle className="text-base text-black flex items-center gap-2">
                                            <span className={`w-3 h-3 rounded-full ${statusColor}`}></span>
                                            {agent.label}
                                        </CardTitle>
                                        <div className="flex gap-2">
                                            <Button size="icon" variant="ghost" title={t("Home:editAgent")}
                                                onClick={() => setEditAgentId(agent.id)}>
                                                <Pencil2Icon className="text-black" />
                                            </Button>
                                            <Button size="icon" variant="ghost" title={t("Home:removeAgent")} onClick={() => {
                                                agentStore.set(agentStore.get().filter(a => a.id !== agent.id));
                                                if (window.electron?.removeAgent) window.electron.removeAgent(agent.id);
                                                toast({ title: t("Agent removed.") });
                                            }}>
                                                <TrashIcon className="text-black" />
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
                                                disabled={!webcamAvailable}
                                            >
                                                {agent.paused ? <PlayIcon className="text-black" /> : <PauseIcon className="text-black" />}
                                            </Button>
                                            {agentProcessing[agent.id] && (
                                                <span className="ml-2">
                                                    <ExclamationTriangleIcon className="animate-spin w-5 h-5 text-black" />
                                                </span>
                                            )}
                                        </div>
                                        {agentErrors[agent.id] && (
                                            <div className="mt-2 text-xs text-red-500 font-semibold">{agentErrors[agent.id]}</div>
                                        )}
                                        {agentResults[agent.id] && !agentErrors[agent.id] && (
                                            <div className="mt-2 text-xs text-green-500 font-semibold">{t("lastResult")}: {agentResults[agent.id]}</div>
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
            <DownloadManager />
        </div>
    );
}