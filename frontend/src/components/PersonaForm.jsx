import React, { useState, useEffect } from 'react';
import xss from 'xss';
import { useTranslation } from "react-i18next";
import { i18n as i18nInstance, locale } from "@/lib/i18n.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { agentStore } from "@/stores/agentStore";
import { defaultPersonas } from "@/personas/defaultPersonas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { initializeAgent, getDeviceCapabilities } from "@/lib/api.js";

export function PersonaForm({ open, onOpenChange, persona: initialPersona, editMode = false, agentId, onSave, viewOnly = false }) {
    const { t } = useTranslation(locale.get(), { i18n: i18nInstance });
    // Always allow 'custom' option, and default to it if no initialPersona
    const [isCustom, setIsCustom] = useState(true);
    const [selectedPersonaId, setSelectedPersonaId] = useState('custom');
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [userPrompt, setUserPrompt] = useState('');
    const [device, setDevice] = useState('auto');
    const [maxLength, setMaxLength] = useState(100);
    const [doSample, setDoSample] = useState(false); // Default to greedy sampling
    const [enableTTS, setEnableTTS] = useState(false); // TTS toggle
    const personas = defaultPersonas;
    const [errors, setErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [interval, setInterval] = useState(initialPersona?.interval || 10);
    const [captureMode, setCaptureMode] = useState(initialPersona?.captureMode || 'interval');
    const [deviceCapabilities, setDeviceCapabilities] = useState(null);
    const [loadingCapabilities, setLoadingCapabilities] = useState(true);

    // Fetch device capabilities on mount
    useEffect(() => {
        const fetchCapabilities = async () => {
            setLoadingCapabilities(true);
            try {
                const capabilities = await getDeviceCapabilities();
                setDeviceCapabilities(capabilities);
                // If CUDA is not available and device is set to cuda, switch to cpu
                if (!capabilities.cuda_available && (device === 'cuda' || device === 'auto')) {
                    setDevice(capabilities.recommended_device);
                }
            } catch (error) {
                console.error('Failed to fetch device capabilities:', error);
                // Set safe defaults
                setDeviceCapabilities({
                    cuda_available: false,
                    cpu_available: true,
                    recommended_device: 'cpu'
                });
                if (device === 'cuda') {
                    setDevice('cpu');
                }
            } finally {
                setLoadingCapabilities(false);
            }
        };
        
        if (open) {
            fetchCapabilities();
        }
    }, [open]);

    // Always update form state when persona or agentId changes
    useEffect(() => {
        const isExisting = initialPersona && personas?.some(p => p.id === initialPersona.id);
        if (initialPersona) {
            setIsCustom(!isExisting);
            setSelectedPersonaId(isExisting ? initialPersona.id : 'custom');
            setLabel(initialPersona.label || '');
            setDescription(initialPersona.description || '');
            setSystemPrompt(initialPersona.systemPrompt || 'You are a helpful assistant.');
            setUserPrompt(initialPersona.userPrompt || 'What do you see in this image?');
            setDevice(initialPersona.device || 'auto');
            setMaxLength(initialPersona.maxLength || 100);
            setDoSample(initialPersona.doSample !== undefined ? initialPersona.doSample : false);
            setEnableTTS(initialPersona.enableTTS !== undefined ? initialPersona.enableTTS : false);
            setInterval(initialPersona.interval || getDefaultInterval(initialPersona.device || 'auto'));
            setCaptureMode(initialPersona.captureMode || 'interval');
        } else {
            setIsCustom(true);
            setSelectedPersonaId('custom');
            setLabel('');
            setDescription('');
            setSystemPrompt('You are a helpful assistant.');
            setUserPrompt('What do you see in this image?');
            setDevice('auto');
            setMaxLength(100);
            setDoSample(false); // Default to greedy sampling
            setInterval(getDefaultInterval('auto'));
            setCaptureMode('interval');
        }
    }, [initialPersona, agentId, personas]);

    // Helper function to calculate processing time based on max length and device
    const calculateProcessingTime = (maxTokens, deviceType) => {
        // 2 tokens per second base rate for both CPU and GPU
        const tokensPerSecond = 2; // Updated to reflect actual CPU performance
        return Math.ceil(maxTokens / tokensPerSecond);
    };

    // Helper function to get default interval based on device and max_length
    const getDefaultInterval = (selectedDevice, maxResponseLength = maxLength) => {
        const effectiveDevice = deviceCapabilities?.cuda_available ? selectedDevice : 'cpu';
        const processingTime = calculateProcessingTime(maxResponseLength, effectiveDevice);
        
        // Add buffer time (20% minimum)
        const bufferTime = Math.max(10, Math.ceil(processingTime * 0.2));
        return processingTime + bufferTime;
    };

    // Get interval options based on calculated processing time
    const getIntervalOptions = () => {
        const baseProcessingTime = calculateProcessingTime(maxLength, deviceCapabilities?.cuda_available ? device : 'cpu');
        const minInterval = getDefaultInterval(device, maxLength);
        
        return [
            { value: minInterval, label: `${t('PersonaForm:intervalOptimal')} (${minInterval}s)`, description: t('PersonaForm:intervalBasedOnProcessing') },
            { value: Math.ceil(minInterval * 1.5), label: `${t('PersonaForm:intervalConservative')} (${Math.ceil(minInterval * 1.5)}s)`, description: t('PersonaForm:intervalExtraBuffer') },
            { value: Math.ceil(minInterval * 2), label: `${t('PersonaForm:intervalRelaxed')} (${Math.ceil(minInterval * 2)}s)`, description: t('PersonaForm:intervalDoubleBuffer') },
            { value: Math.ceil(minInterval * 3), label: `${t('PersonaForm:intervalSlow')} (${Math.ceil(minInterval * 3)}s)`, description: t('PersonaForm:intervalLowResource') },
        ];
    };

    // Update interval when device or maxLength changes
    useEffect(() => {
        if (!initialPersona && deviceCapabilities) { // Only auto-update for new agents when capabilities are loaded
            const newInterval = getDefaultInterval(device, maxLength);
            setInterval(newInterval);
        }
    }, [device, maxLength, deviceCapabilities, initialPersona]);

    const validate = () => {
        if (!isCustom) return true; // No validation needed if selecting an existing persona
        const newErrors = {};
        if (!label.trim()) newErrors.label = t('PersonaForm:labelRequired');
        if (!description.trim()) newErrors.description = t('PersonaForm:descriptionRequired');
        if (!systemPrompt.trim()) newErrors.systemPrompt = t('PersonaForm:promptRequired');
        if (!userPrompt.trim()) newErrors.userPrompt = t('PersonaForm:userPromptRequired');
        if (maxLength < 1 || maxLength > 8192) newErrors.maxLength = 'Max length must be between 1 and 8192';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Individual handlers for each field
    const handleLabelChange = (e) => setLabel(e.target.value);
    const handleDescriptionChange = (e) => setDescription(e.target.value);
    const handleSystemPromptChange = (e) => setSystemPrompt(e.target.value);
    const handleUserPromptChange = (e) => setUserPrompt(e.target.value);

    const handleSelectChange = (value) => {
        setSelectedPersonaId(value);
        if (value === 'custom') {
            setIsCustom(true);
            setLabel('');
            setDescription('');
            setSystemPrompt('You are a helpful assistant.');
            setUserPrompt('What do you see in this image?');
            setDevice('auto');
            setMaxLength(100);
            setDoSample(true);
            setCaptureMode('interval');
        } else {
            setIsCustom(false);
            const selected = personas.find(p => p.id === value);
            if (selected) {
                setLabel(selected.label || '');
                setDescription(selected.description || '');
                setSystemPrompt(selected.systemPrompt || 'You are a helpful assistant.');
                setUserPrompt(selected.userPrompt || 'What do you see in this image?');
                setDevice(selected.device || 'auto');
                setMaxLength(selected.maxLength || 100);
                setDoSample(selected.doSample !== undefined ? selected.doSample : true);
                setCaptureMode(selected.captureMode || 'interval');
            }
        }
    };


    const handleSave = async () => {
        if (!validate()) {
            console.error('Validation failed:', errors);
            return;
        }
        setIsSaving(true);
        try {
            let agentData;
            if (isCustom) {
                agentData = {
                    label: xss(label),
                    description: xss(description),
                    systemPrompt: xss(systemPrompt),
                    userPrompt: xss(userPrompt),
                    device: device,
                    maxLength: maxLength,
                    doSample: doSample,
                    enableTTS: enableTTS,
                    interval: interval,
                    captureMode: captureMode,
                    paused: true,
                    id: initialPersona?.id || `agent-${Date.now()}`
                };
            } else {
                const selected = personas.find(p => p.id === selectedPersonaId);
                agentData = {
                    ...selected,
                    device: device,
                    maxLength: maxLength,
                    doSample: doSample,
                    enableTTS: enableTTS,
                    interval: interval,
                    captureMode: captureMode,
                    paused: true,
                    id: initialPersona?.id || `agent-${Date.now()}`
                };
            }

            if (editMode && agentId) {
                // For editing, we need to shutdown the old agent and reinitialize
                console.log('Editing agent - shutting down old instance...');
                
                // Import shutdown function
                const { shutdownAgent } = await import('@/lib/api.js');
                
                try {
                    await shutdownAgent(agentId);
                    console.log('Old agent instance shut down successfully');
                } catch (shutdownError) {
                    console.warn('Warning: Failed to shutdown old agent instance:', shutdownError);
                    // Continue anyway - the new instance will use the same ID
                }
                
                // Now initialize with new configuration
                console.log('Initializing agent with new configuration via FastAPI...');
                const result = await initializeAgent(agentData);
                if (!result.success) {
                    console.error('Failed to initialize agent:', result.error);
                    setIsSaving(false);
                    return;
                }
                console.log('Agent reinitialized via FastAPI:', result.data);

                // Update the existing agent in store
                const agents = agentStore.get();
                const updatedAgents = agents.map(agent =>
                    agent.id === agentId
                        ? { ...agent, ...agentData }
                        : agent
                );
                agentStore.set(updatedAgents);
                console.log('Agent updated:', updatedAgents.find(a => a.id === agentId));
            } else {
                // Debug log
                console.log('Saving agent:', agentData);

                // Initialize agent via FastAPI endpoint
                console.log('Initializing agent via FastAPI...');
                const result = await initializeAgent(agentData);
                if (!result.success) {
                    console.error('Failed to initialize agent:', result.error);
                    setIsSaving(false);
                    return; // Stop if FastAPI initialization fails
                }
                console.log('Agent initialized via FastAPI:', result.data);

                // Add agent to agentStore
                const agents = agentStore.get();
                agentStore.set([...agents, agentData]);
                console.log('Agent added:', agentData);
            }
            
            if (onSave) onSave(agentData); // Close dialog after save
            if (onOpenChange) onOpenChange(false); // Close dialog
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border border-black max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {viewOnly 
                            ? t('PersonaForm:viewTitle') 
                            : initialPersona 
                                ? t('PersonaForm:editTitle') 
                                : t('PersonaForm:createTitle')
                        }
                    </DialogTitle>
                    <DialogDescription>{t('PersonaForm:description')}</DialogDescription>
                </DialogHeader>
                {viewOnly && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <div className="flex items-center gap-2 text-blue-800 text-sm">
                            <span>ℹ️</span>
                            <span>This persona is displayed in read-only mode. You cannot make changes.</span>
                        </div>
                    </div>
                )}
                <div className="space-y-6">
                    {!editMode && personas && (
                        <div className="space-y-2">
                            <Label htmlFor="persona-select">{t('PersonaForm:choosePersona')}</Label>
                            <Select onValueChange={handleSelectChange} value={isCustom ? 'custom' : selectedPersonaId} disabled={viewOnly}>
                                <SelectTrigger id="persona-select">
                                    <SelectValue placeholder={t('PersonaForm:selectPlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {personas.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                                    ))}
                                    <SelectItem value="custom">{t('PersonaForm:customPersona')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="label">{t('PersonaForm:label')}</Label>
                        <Input
                            id="label"
                            name="label"
                            value={label}
                            onChange={handleLabelChange}
                            placeholder={t('PersonaForm:labelPlaceholder')}
                            maxLength={40}
                            disabled={viewOnly}
                            className={errors.label ? 'border-red-500' : ''}
                        />
                        <div className="text-xs text-muted-foreground flex justify-between">
                            <span>{errors.label || t('PersonaForm:labelHelp')}</span>
                            <span>{label.length} / 40</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">{t('PersonaForm:descriptionField')}</Label>
                        <Input
                            id="description"
                            name="description"
                            value={description}
                            onChange={handleDescriptionChange}
                            placeholder={t('PersonaForm:descriptionPlaceholder')}
                            maxLength={80}
                            disabled={viewOnly}
                            className={errors.description ? 'border-red-500' : ''}
                        />
                        <div className="text-xs text-muted-foreground flex justify-between">
                            <span>{errors.description || t('PersonaForm:descriptionHelp')}</span>
                            <span>{description.length} / 80</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="systemPrompt">{t('PersonaForm:systemPrompt')}</Label>
                        <Textarea
                            id="systemPrompt"
                            name="systemPrompt"
                            value={systemPrompt}
                            onChange={handleSystemPromptChange}
                            placeholder={t('PersonaForm:systemPromptPlaceholder')}
                            maxLength={1000}
                            disabled={viewOnly}
                            className={`min-h-[120px] ${errors.systemPrompt ? 'border-red-500' : ''}`}
                        />
                        <div className="text-xs text-muted-foreground flex justify-between">
                            <span>{errors.systemPrompt || t('PersonaForm:systemPromptHelp')}</span>
                            <span>{systemPrompt.length} / 1000</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="userPrompt">{t('PersonaForm:userPromptTemplate')}</Label>
                        <Textarea
                            id="userPrompt"
                            name="userPrompt"
                            value={userPrompt}
                            onChange={handleUserPromptChange}
                            placeholder={t('PersonaForm:userPromptPlaceholder')}
                            maxLength={500}
                            disabled={viewOnly}
                            className={`min-h-[80px] ${errors.userPrompt ? 'border-red-500' : ''}`}
                        />
                        <div className="text-xs text-muted-foreground flex justify-between">
                            <span>{errors.userPrompt || t('PersonaForm:userPromptHelp')}</span>
                            <span>{userPrompt.length} / 500</span>
                        </div>
                    </div>

                    {/* Technical Configuration Section */}
                    <div className="border-t pt-4">
                        <h3 className="text-sm font-medium mb-3">{t('PersonaForm:technicalConfiguration')}</h3>
                        
                        <div className="space-y-2">
                            <Label htmlFor="device">{t('PersonaForm:computeDevice')}</Label>
                            <Select value={device} onValueChange={setDevice} disabled={loadingCapabilities || viewOnly}>
                                <SelectTrigger id="device">
                                    <SelectValue placeholder={loadingCapabilities ? t('PersonaForm:loadingCapabilities') : t('PersonaForm:selectDevice')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {loadingCapabilities ? (
                                        <SelectItem value="loading" disabled>{t('PersonaForm:loadingDeviceCapabilities')}</SelectItem>
                                    ) : (
                                        <>
                                            <SelectItem value="auto">{t('PersonaForm:autoDetect')}</SelectItem>
                                            {deviceCapabilities?.cuda_available && (
                                                <SelectItem value="cuda">{t('PersonaForm:gpuCuda')}</SelectItem>
                                            )}
                                            <SelectItem value="cpu">{t('PersonaForm:cpuOnly')}</SelectItem>
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground">
                                {loadingCapabilities ? t('PersonaForm:loadingDeviceCapabilities') : 
                                 deviceCapabilities?.cuda_available ? t('PersonaForm:deviceCapabilitiesHelp') : t('PersonaForm:deviceCapabilitiesNoGpu')}
                            </div>
                        </div>
                    </div>

                    {/* Generation Parameters Section */}
                    <div className="border-t pt-4">
                        <h3 className="text-sm font-medium mb-3">{t('PersonaForm:generationParameters')}</h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="maxLength">{t('PersonaForm:maxResponseLength')}</Label>
                                <Input
                                    type="number"
                                    id="maxLength"
                                    value={maxLength}
                                    onChange={(e) => setMaxLength(parseInt(e.target.value) || 100)}
                                    min="1"
                                    max="8192"
                                    disabled={viewOnly}
                                    className={errors.maxLength ? 'border-red-500' : ''}
                                />
                                <div className="text-xs text-muted-foreground">
                                    {errors.maxLength || t('PersonaForm:maxLengthHelp')}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 mt-4">
                            <Label htmlFor="doSample">{t('PersonaForm:samplingMode')}</Label>
                            <Select value={doSample.toString()} onValueChange={val => setDoSample(val === 'true')} disabled={viewOnly}>
                                <SelectTrigger id="doSample">
                                    <SelectValue placeholder={t('PersonaForm:selectSamplingMode')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true">{t('PersonaForm:samplingModeVaried')}</SelectItem>
                                    <SelectItem value="false">{t('PersonaForm:samplingModeDeterministic')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground">
                                {t('PersonaForm:samplingModeHelp')}
                            </div>
                        </div>

                        <div className="space-y-2 mt-4">
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="enableTTS"
                                    checked={enableTTS}
                                    onCheckedChange={setEnableTTS}
                                    disabled={viewOnly}
                                />
                                <Label htmlFor="enableTTS" className="text-sm font-medium">
                                    🔊 {t('PersonaForm:enableTTS')} - {enableTTS ? t('PersonaForm:enabled') : t('PersonaForm:disabled')}
                                </Label>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {t('PersonaForm:enableTTSHelp')}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="captureMode">{t('PersonaForm:captureMode')}</Label>
                        <Select value={captureMode} onValueChange={setCaptureMode} disabled={viewOnly}>
                            <SelectTrigger id="captureMode">
                                <SelectValue placeholder="Select capture mode" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="interval">
                                    <div className="flex items-center gap-2">
                                        <span>{t('PersonaForm:captureModeInterval')}</span>
                                        <span className="text-xs text-muted-foreground">- {t('PersonaForm:captureModeIntervalDesc')}</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="manual">
                                    <div className="flex items-center gap-2">
                                        <span>{t('PersonaForm:captureModeManual')}</span>
                                        <span className="text-xs text-muted-foreground">- {t('PersonaForm:captureModeManualDesc')}</span>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                            {t('PersonaForm:captureModeHelp')}
                        </div>
                    </div>

                    {captureMode === 'interval' && (
                    <div className="space-y-2">
                        <Label htmlFor="interval">{t('PersonaForm:interval')}</Label>
                        <Select value={interval} onValueChange={val => setInterval(Number(val))} disabled={loadingCapabilities || !deviceCapabilities || viewOnly}>
                            <SelectTrigger id="interval">
                                <SelectValue placeholder={loadingCapabilities ? t('PersonaForm:loadingCapabilities') : t('PersonaForm:intervalPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                {loadingCapabilities || !deviceCapabilities ? (
                                    <SelectItem value="loading" disabled>{t('PersonaForm:loadingDeviceInfo')}</SelectItem>
                                ) : (
                                    getIntervalOptions().map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                            <div>{t('PersonaForm:intervalHelp')}</div>
                            {deviceCapabilities && !loadingCapabilities && (
                                <div className="mt-1 text-blue-600">
                                    {t('PersonaForm:processingTimeHelp', {
                                        time: calculateProcessingTime(maxLength, deviceCapabilities?.cuda_available ? device : 'cpu'),
                                        tokens: maxLength,
                                        rate: deviceCapabilities?.cuda_available && device === 'cuda' ? '5' : '2'
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    )}

                </div>
                <DialogFooter className="flex justify-end gap-2 p-4">
                    {viewOnly ? (
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('close')}
                        </Button>
                    ) : (
                        <>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                {t('cancel')}
                            </Button>
                            <Button type="button" disabled={isSaving} onClick={handleSave}>
                                {isSaving ? (
                                    <span className="flex items-center">
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('saving')}
                                    </span>
                                ) : (
                                    t('save')
                                )}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
