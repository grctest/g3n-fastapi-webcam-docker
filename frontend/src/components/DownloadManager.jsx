import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { downloadStatus } from '../stores/downloadStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Download, Trash2, RefreshCw, Loader2 } from "lucide-react";

export function DownloadManager() {
    const { status, modelId, error } = useStore(downloadStatus);
    const { toast } = useToast();
    const [isClearing, setIsClearing] = useState(false);

    const isOpen = status === 'downloading' || status === 'error';

    const handleClearCache = async () => {
        setIsClearing(true);
        try {
            console.log('[DEBUG] Clearing Hugging Face cache...');
            if (window.electron?.clearHFCache) {
                const result = await window.electron.clearHFCache();
                if (result.success) {
                    toast({ 
                        title: "Cache cleared successfully", 
                        description: "Cache cleared. The download will retry automatically." 
                    });
                    // Don't reset download status - let it stay in error state for user to see
                } else {
                    toast({ 
                        title: "Failed to clear cache", 
                        description: result.error,
                        variant: "destructive"
                    });
                }
            }
        } catch (err) {
            console.error('[DEBUG] Error clearing cache:', err);
            toast({ 
                title: "Error clearing cache", 
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsClearing(false);
        }
    };

    const handleRetry = () => {
        // Reset the download status to allow retry
        downloadStatus.set({ status: 'idle', modelId: null, error: null });
    };

    const handleForceRetry = async () => {
        try {
            // Get the current agents to find the failing one
            if (window.electron?.forceRestartAgentInit) {
                // For now, we'll use a generic agent ID, but this could be improved to track which agent is failing
                // You might want to store the failing agent ID in the download status
                const agents = JSON.parse(localStorage.getItem('agents') || '[]');
                if (agents.length > 0) {
                    const result = await window.electron.forceRestartAgentInit(agents[0].id);
                    if (result.success) {
                        toast({ 
                            title: "Download restarted", 
                            description: "Attempting to download the model again with fresh cache..." 
                        });
                    } else {
                        toast({ 
                            title: "Failed to restart download", 
                            description: result.error,
                            variant: "destructive"
                        });
                    }
                } else {
                    toast({ 
                        title: "No agents found", 
                        description: "Cannot retry without an agent to initialize.",
                        variant: "destructive"
                    });
                }
            }
        } catch (err) {
            console.error('[DEBUG] Error during force retry:', err);
            toast({ 
                title: "Error during retry", 
                description: err.message,
                variant: "destructive"
            });
        }
    };

    const getStatusIcon = () => {
        if (status === 'error') return <AlertTriangle className="w-5 h-5 text-red-500" />;
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    };

    const getStatusMessage = () => {
        if (status === 'error') return 'Download Failed';
        return 'Downloading Model';
    };

    return (
        <Dialog open={isOpen} onOpenChange={() => {}}>
            <DialogContent className="bg-white border border-black sm:max-w-[500px]" onPointerDownOutside={(e) => e.preventDefault()} showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {getStatusIcon()}
                        {getStatusMessage()}
                    </DialogTitle>
                    <DialogDescription>
                        {status === 'downloading' && (
                            <div className="space-y-2">
                                <p>Downloading {modelId}. Please wait, this may take a while.</p>
                                <p className="text-xs text-muted-foreground">
                                    The model is approximately 1.8GB+ in size and may take several minutes to download.
                                </p>
                            </div>
                        )}
                        {status === 'error' && (
                            <div className="space-y-3">
                                <p className="text-red-600">Failed to download {modelId}.</p>
                                {error && (
                                    <div className="text-xs text-red-700 bg-red-50 p-3 rounded border border-red-200">
                                        <strong>Error details:</strong><br />
                                        {error}
                                    </div>
                                )}
                                <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded border border-blue-200">
                                    <strong>Troubleshooting:</strong><br />
                                    • The model files appear to be corrupted or incomplete<br />
                                    • This often happens due to network interruptions during download<br />
                                    • Use "Force Retry Download" to clear cache and restart download<br />
                                    • Ensure you have a stable internet connection<br />
                                    • The model is approximately 1.8GB+ in size<br />
                                    • The download may show 100% but still be incomplete
                                </div>
                            </div>
                        )}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                    {status === 'downloading' && (
                        <div className="flex items-center justify-center space-x-2">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            <span className="text-sm text-muted-foreground">Downloading...</span>
                        </div>
                    )}
                    
                    {modelId && (
                        <div className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                            <strong>Model:</strong> {modelId}
                        </div>
                    )}
                </div>
                
                {status === 'error' && (
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button 
                            variant="outline" 
                            onClick={handleRetry} 
                            className="w-full sm:w-auto"
                        >
                            Dismiss
                        </Button>
                        
                        <Button 
                            onClick={handleForceRetry}
                            className="w-full sm:w-auto"
                            disabled={isClearing}
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Force Retry Download
                        </Button>
                        
                        <Button 
                            onClick={handleClearCache}
                            className="w-full sm:w-auto"
                            disabled={isClearing}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {isClearing ? "Clearing..." : "Clear Cache"}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
