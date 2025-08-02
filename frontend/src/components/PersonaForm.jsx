import React, { useState, useEffect } from 'react';
import xss from 'xss';
import { useTranslation } from "react-i18next";
import { i18n as i18nInstance, locale } from "@/lib/i18n.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { agentStore } from "@/stores/agentStore";
import { defaultPersonas } from "@/personas/defaultPersonas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Eraser } from 'lucide-react';
import { initializeAgent } from "@/lib/api.js";

export function PersonaForm({ open, onOpenChange, persona: initialPersona, editMode = false, agentId, onSave }) {
    const { t } = useTranslation(locale.get(), { i18n: i18nInstance });
    // Always allow 'custom' option, and default to it if no initialPersona
    const [isCustom, setIsCustom] = useState(true);
    const [selectedPersonaId, setSelectedPersonaId] = useState('custom');
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [userPrompt, setUserPrompt] = useState('');
    const [device, setDevice] = useState('auto');
    const [temperature, setTemperature] = useState(0.8);
    const [maxLength, setMaxLength] = useState(512);
    const [loadIn4bit, setLoadIn4bit] = useState(true);
    const [topP, setTopP] = useState(0.9);
    const [topK, setTopK] = useState(50);
    const [doSample, setDoSample] = useState(true);
    const personas = defaultPersonas;
    const [errors, setErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [interval, setInterval] = useState(initialPersona?.interval || 10);
    const { toast } = useToast();

    // Always update form state when persona or agentId changes
    useEffect(() => {
        const isExisting = initialPersona && personas?.some(p => p.id === initialPersona.id);
        if (initialPersona) {
            setIsCustom(!isExisting);
            setSelectedPersonaId(isExisting ? initialPersona.id : 'custom');
            setLabel(initialPersona.label || '');
            setDescription(initialPersona.description || '');
            setSystemPrompt(initialPersona.systemPrompt || '');
            setUserPrompt(initialPersona.userPrompt || 'What do you see in this image?');
            setDevice(initialPersona.device || 'auto');
            setTemperature(initialPersona.temperature || 0.8);
            setMaxLength(initialPersona.maxLength || 512);
            setLoadIn4bit(initialPersona.loadIn4bit !== undefined ? initialPersona.loadIn4bit : true);
            setTopP(initialPersona.topP || 0.9);
            setTopK(initialPersona.topK || 50);
            setDoSample(initialPersona.doSample !== undefined ? initialPersona.doSample : true);
            setInterval(initialPersona.interval || getDefaultInterval(initialPersona.device || 'auto'));
        } else {
            setIsCustom(true);
            setSelectedPersonaId('custom');
            setLabel('');
            setDescription('');
            setSystemPrompt('');
            setUserPrompt('What do you see in this image?');
            setDevice('auto');
            setTemperature(0.8);
            setMaxLength(512);
            setLoadIn4bit(true);
            setTopP(0.9);
            setTopK(50);
            setDoSample(true);
            setInterval(getDefaultInterval('auto'));
        }
    }, [initialPersona, agentId, personas]);

    // Helper function to get default interval based on device
    const getDefaultInterval = (selectedDevice) => {
        switch(selectedDevice) {
            case 'cpu': return 30; // Slower for CPU
            case 'cuda': return 10; // Faster for GPU
            case 'auto': return 15; // Medium for auto-detect
            default: return 15;
        }
    };

    // Update interval when device changes
    useEffect(() => {
        if (!initialPersona) { // Only auto-update for new agents
            setInterval(getDefaultInterval(device));
        }
    }, [device, initialPersona]);

    const handleClearCache = async () => {
        console.log('[DEBUG] Clear cache functionality removed - models managed by Docker container');
        toast({
            title: "Cache Management",
            description: "Model cache is managed by the Docker container. Restart the container to clear cache.",
        });
    };

    const validate = () => {
        if (!isCustom) return true; // No validation needed if selecting an existing persona
        const newErrors = {};
        if (!label.trim()) newErrors.label = t('PersonaForm:labelRequired');
        if (!description.trim()) newErrors.description = t('PersonaForm:descriptionRequired');
        if (!systemPrompt.trim()) newErrors.systemPrompt = t('PersonaForm:promptRequired');
        if (!userPrompt.trim()) newErrors.userPrompt = 'User prompt is required';
        if (temperature < 0 || temperature > 2) newErrors.temperature = 'Temperature must be between 0 and 2';
        if (maxLength < 1 || maxLength > 8192) newErrors.maxLength = 'Max length must be between 1 and 8192';
        if (topP < 0 || topP > 1) newErrors.topP = 'Top-p must be between 0 and 1';
        if (topK < 1) newErrors.topK = 'Top-k must be at least 1';
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
            setSystemPrompt('');
            setUserPrompt('What do you see in this image?');
            setDevice('auto');
            setTemperature(0.8);
            setMaxLength(512);
            setLoadIn4bit(true);
            setTopP(0.9);
            setTopK(50);
            setDoSample(true);
        } else {
            setIsCustom(false);
            const selected = personas.find(p => p.id === value);
            if (selected) {
                setLabel(selected.label || '');
                setDescription(selected.description || '');
                setSystemPrompt(selected.systemPrompt || '');
                setUserPrompt(selected.userPrompt || 'What do you see in this image?');
                setDevice(selected.device || 'auto');
                setTemperature(selected.temperature || 0.8);
                setMaxLength(selected.maxLength || 512);
                setLoadIn4bit(selected.loadIn4bit !== undefined ? selected.loadIn4bit : true);
                setTopP(selected.topP || 0.9);
                setTopK(selected.topK || 50);
                setDoSample(selected.doSample !== undefined ? selected.doSample : true);
            }
        }
    };


    const handleSave = async () => {
        if (!validate()) {
            toast({
                title: t('PersonaForm:validationErrorTitle'),
                description: t('PersonaForm:validationErrorDescription'),
                variant: "destructive",
            });
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
                    temperature: temperature,
                    maxLength: maxLength,
                    loadIn4bit: loadIn4bit,
                    topP: topP,
                    topK: topK,
                    doSample: doSample,
                    interval: interval,
                    paused: true,
                    id: initialPersona?.id || `agent-${Date.now()}`
                };
            } else {
                const selected = personas.find(p => p.id === selectedPersonaId);
                agentData = {
                    ...selected,
                    device: device,
                    temperature: temperature,
                    maxLength: maxLength,
                    loadIn4bit: loadIn4bit,
                    topP: topP,
                    topK: topK,
                    doSample: doSample,
                    interval: interval,
                    paused: true,
                    id: initialPersona?.id || `agent-${Date.now()}`
                };
            }
            // Debug log
            console.log('Saving agent:', agentData);

            // Initialize agent via FastAPI endpoint
            console.log('Initializing agent via FastAPI...');
            const result = await initializeAgent(agentData);
            if (!result.success) {
                toast({
                    title: t('PersonaForm:backendErrorTitle') || 'FastAPI Error',
                    description: result.error || t('PersonaForm:backendErrorDescription') || 'Could not initialize agent via FastAPI.',
                    variant: "destructive",
                });
                setIsSaving(false);
                return; // Stop if FastAPI initialization fails
            }
            console.log('Agent initialized via FastAPI:', result.data);

            const agents = agentStore.get();
            if (editMode && agentId) {
                // Update the existing agent by agentId
                const updatedAgents = agents.map(agent =>
                    agent.id === agentId
                        ? { ...agent, ...agentData }
                        : agent
                );
                agentStore.set(updatedAgents);
                console.log('Agent updated:', updatedAgents.find(a => a.id === agentId));
                toast({ title: t('PersonaForm:agentUpdated') || 'Agent updated successfully!' });
            } else {
                // Add agent to agentStore
                agentStore.set([...agents, agentData]);
                console.log('Agent added:', agentData);
                toast({ title: t('PersonaForm:agentAdded') || 'Agent added successfully!' });
            }
            if (onSave) onSave(agentData); // Close dialog after save
            if (onOpenChange) onOpenChange(false); // Close dialog
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border border-black">
                <DialogHeader>
                    <div className="flex justify-between items-center">
                        <DialogTitle>{initialPersona ? t('PersonaForm:editTitle') : t('PersonaForm:createTitle')}</DialogTitle>
                        <Button variant="ghost" size="icon" onClick={handleClearCache} title="Clear model cache">
                            <Eraser className="w-5 h-5" />
                        </Button>
                    </div>
                    <DialogDescription>{t('PersonaForm:description')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                    {!editMode && personas && (
                        <div className="space-y-2">
                            <Label htmlFor="persona-select">{t('PersonaForm:choosePersona')}</Label>
                            <Select onValueChange={handleSelectChange} value={isCustom ? 'custom' : selectedPersonaId}>
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
                            className={`min-h-[120px] ${errors.systemPrompt ? 'border-red-500' : ''}`}
                        />
                        <div className="text-xs text-muted-foreground flex justify-between">
                            <span>{errors.systemPrompt || t('PersonaForm:systemPromptHelp')}</span>
                            <span>{systemPrompt.length} / 1000</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="userPrompt">User Prompt Template</Label>
                        <Textarea
                            id="userPrompt"
                            name="userPrompt"
                            value={userPrompt}
                            onChange={handleUserPromptChange}
                            placeholder="e.g., 'Detect fire in this image', 'What objects do you see?'"
                            maxLength={500}
                            className={`min-h-[80px] ${errors.userPrompt ? 'border-red-500' : ''}`}
                        />
                        <div className="text-xs text-muted-foreground flex justify-between">
                            <span>{errors.userPrompt || 'This will be sent with each image for analysis'}</span>
                            <span>{userPrompt.length} / 500</span>
                        </div>
                    </div>

                    {/* Technical Configuration Section */}
                    <div className="border-t pt-4">
                        <h3 className="text-sm font-medium mb-3">Technical Configuration</h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="device">Compute Device</Label>
                                <Select value={device} onValueChange={setDevice}>
                                    <SelectTrigger id="device">
                                        <SelectValue placeholder="Select device" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto">Auto-detect</SelectItem>
                                        <SelectItem value="cuda">GPU (CUDA)</SelectItem>
                                        <SelectItem value="cpu">CPU Only</SelectItem>
                                    </SelectContent>
                                </Select>
                                <div className="text-xs text-muted-foreground">
                                    GPU is faster, CPU is more compatible
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="loadIn4bit">4-bit Quantization</Label>
                                <Select value={loadIn4bit.toString()} onValueChange={val => setLoadIn4bit(val === 'true')}>
                                    <SelectTrigger id="loadIn4bit">
                                        <SelectValue placeholder="Select quantization" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true">Enabled (~15GB RAM)</SelectItem>
                                        <SelectItem value="false">Disabled (~20GB RAM)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <div className="text-xs text-muted-foreground">
                                    <div className="mb-1">
                                        <span className="font-semibold">Enabled:</span> Uses ~15GB RAM, faster loading, slightly reduced quality
                                    </div>
                                    <div>
                                        <span className="font-semibold">Disabled:</span> Uses ~20GB RAM, slower loading, full precision quality
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Generation Parameters Section */}
                    <div className="border-t pt-4">
                        <h3 className="text-sm font-medium mb-3">Generation Parameters</h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="temperature">Temperature ({temperature})</Label>
                                <input
                                    type="range"
                                    id="temperature"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={temperature}
                                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                    className="w-full"
                                />
                                <div className="text-xs text-muted-foreground">
                                    Lower = more focused, Higher = more creative
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="maxLength">Max Response Length</Label>
                                <Input
                                    type="number"
                                    id="maxLength"
                                    value={maxLength}
                                    onChange={(e) => setMaxLength(parseInt(e.target.value) || 512)}
                                    min="1"
                                    max="8192"
                                    className={errors.maxLength ? 'border-red-500' : ''}
                                />
                                <div className="text-xs text-muted-foreground">
                                    {errors.maxLength || 'Maximum tokens to generate (1-8192)'}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div className="space-y-2">
                                <Label htmlFor="topP">Top-p ({topP})</Label>
                                <input
                                    type="range"
                                    id="topP"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={topP}
                                    onChange={(e) => setTopP(parseFloat(e.target.value))}
                                    className="w-full"
                                />
                                <div className="text-xs text-muted-foreground">
                                    Nucleus sampling threshold
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="topK">Top-k</Label>
                                <Input
                                    type="number"
                                    id="topK"
                                    value={topK}
                                    onChange={(e) => setTopK(parseInt(e.target.value) || 50)}
                                    min="1"
                                    max="200"
                                    className={errors.topK ? 'border-red-500' : ''}
                                />
                                <div className="text-xs text-muted-foreground">
                                    {errors.topK || 'Top-k sampling limit (1-200)'}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 mt-4">
                            <Label htmlFor="doSample">Sampling Mode</Label>
                            <Select value={doSample.toString()} onValueChange={val => setDoSample(val === 'true')}>
                                <SelectTrigger id="doSample">
                                    <SelectValue placeholder="Select sampling mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true">Sampling (More varied)</SelectItem>
                                    <SelectItem value="false">Greedy (More deterministic)</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground">
                                Sampling uses temperature/top-p, greedy always picks most likely
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="interval">{t('PersonaForm:interval')}</Label>
                        <Select value={interval} onValueChange={val => setInterval(Number(val))}>
                            <SelectTrigger id="interval">
                                <SelectValue placeholder={t('PersonaForm:intervalPlaceholder') || 'Interval'} />
                            </SelectTrigger>
                            <SelectContent>
                                {device === 'cpu' ? (
                                    <>
                                        <SelectItem value={30}>30s (Recommended for CPU)</SelectItem>
                                        <SelectItem value={45}>45s</SelectItem>
                                        <SelectItem value={60}>60s</SelectItem>
                                    </>
                                ) : device === 'cuda' ? (
                                    <>
                                        <SelectItem value={5}>5s (Fast GPU)</SelectItem>
                                        <SelectItem value={10}>10s (Recommended for GPU)</SelectItem>
                                        <SelectItem value={15}>15s</SelectItem>
                                        <SelectItem value={20}>20s</SelectItem>
                                    </>
                                ) : (
                                    <>
                                        <SelectItem value={10}>10s</SelectItem>
                                        <SelectItem value={15}>15s (Recommended for Auto)</SelectItem>
                                        <SelectItem value={20}>20s</SelectItem>
                                        <SelectItem value={30}>30s</SelectItem>
                                    </>
                                )}
                            </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                            <span>{t('PersonaForm:intervalHelp') || 'How often this agent runs.'}</span>
                            {device === 'cpu' && <span className="text-orange-600 ml-2">CPU inference is slow - longer intervals recommended</span>}
                            {device === 'cuda' && <span className="text-green-600 ml-2">GPU inference is fast - shorter intervals available</span>}
                        </div>
                    </div>

                </div>
                <DialogFooter className="flex justify-end gap-2 p-4">
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
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
