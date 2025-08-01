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

export function PersonaForm({ open, onOpenChange, persona: initialPersona, editMode = false, agentId, onSave }) {
    const { t } = useTranslation(locale.get(), { i18n: i18nInstance });
    // Always allow 'custom' option, and default to it if no initialPersona
    const [isCustom, setIsCustom] = useState(true);
    const [selectedPersonaId, setSelectedPersonaId] = useState('custom');
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
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
            setInterval(initialPersona.interval || 10);
        } else {
            setIsCustom(true);
            setSelectedPersonaId('custom');
            setLabel('');
            setDescription('');
            setSystemPrompt('');
            setInterval(10);
        }
    }, [initialPersona, agentId, personas]);

    const handleClearCache = async () => {
        console.log('[DEBUG] Clearing Hugging Face cache...');
        const result = await window.electron.clearHFCache();
        if (result.success) {
            toast({
                title: "Cache Cleared",
                description: "The model cache has been cleared. Please restart the application to re-download models.",
            });
        } else {
            toast({
                title: "Cache Clear Failed",
                description: `Could not clear the cache: ${result.error}`,
                variant: "destructive",
            });
        }
    };

    const validate = () => {
        if (!isCustom) return true; // No validation needed if selecting an existing persona
        const newErrors = {};
        if (!label.trim()) newErrors.label = t('PersonaForm:labelRequired');
        if (!description.trim()) newErrors.description = t('PersonaForm:descriptionRequired');
        if (!systemPrompt.trim()) newErrors.systemPrompt = t('PersonaForm:promptRequired');
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Individual handlers for each field
    const handleLabelChange = (e) => setLabel(e.target.value);
    const handleDescriptionChange = (e) => setDescription(e.target.value);
    const handleSystemPromptChange = (e) => setSystemPrompt(e.target.value);

    const handleSelectChange = (value) => {
        setSelectedPersonaId(value);
        if (value === 'custom') {
            setIsCustom(true);
            setLabel('');
            setDescription('');
            setSystemPrompt('');
        } else {
            setIsCustom(false);
            const selected = personas.find(p => p.id === value);
            if (selected) {
                setLabel(selected.label || '');
                setDescription(selected.description || '');
                setSystemPrompt(selected.systemPrompt || '');
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
                    interval: interval,
                    paused: true,
                    id: initialPersona?.id || `agent-${Date.now()}`
                };
            } else {
                const selected = personas.find(p => p.id === selectedPersonaId);
                agentData = {
                    ...selected,
                    interval: interval,
                    paused: true,
                    id: initialPersona?.id || `agent-${Date.now()}`
                };
            }
            // Debug log
            console.log('Saving agent:', agentData);

            // Initialize agent in the backend
            if (window.electron?.agentInit) {
                console.log('Initializing agent in backend...');
                const result = await window.electron.agentInit(agentData);
                if (!result.success) {
                    toast({
                        title: t('PersonaForm:backendErrorTitle') || 'Backend Error',
                        description: result.error || t('PersonaForm:backendErrorDescription') || 'Could not initialize agent in the backend.',
                        variant: "destructive",
                    });
                    setIsSaving(false);
                    return; // Stop if backend initialization fails
                }
                console.log('Agent initialized in backend:', result);
            }

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
                        <Label htmlFor="interval">{t('PersonaForm:interval')}</Label>
                        <Select value={interval} onValueChange={val => setInterval(Number(val))}>
                            <SelectTrigger id="interval">
                                <SelectValue placeholder={t('PersonaForm:intervalPlaceholder') || 'Interval'} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={10}>{t('PersonaForm:interval10') || '10s'}</SelectItem>
                                <SelectItem value={20}>{t('PersonaForm:interval20') || '20s'}</SelectItem>
                                <SelectItem value={30}>{t('PersonaForm:interval30') || '30s'}</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground flex justify-between">
                            <span>{t('PersonaForm:intervalHelp') || 'Set how often this agent runs (seconds).'}</span>
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
