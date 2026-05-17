'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { Activity, Loader2, Upload } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { TierGateBanner } from '@/components/tier-gate-banner';
import { isTier1 } from '@/components/tier-gate.utils';
import { uploadFile } from '@/features/files/api/opencode-files';
import { useCreateOpenCodeSession } from '@/hooks/opencode/use-opencode-sessions';
import { useSubscriptionStore } from '@/stores/subscription-store';
import { useServerStore } from '@/stores/server-store';
import { openTabAndNavigate } from '@/stores/tab-store';
import { buildShadowAnalyzePrompt, dispatchShadowPrompt } from './shadow-account.utils';

export function ShadowAccountClient() {
  const accountState = useSubscriptionStore((s) => s.accountState);
  const tierKey = accountState?.subscription?.tier_key;
  const blocked = isTier1(tierKey);

  const createSession = useCreateOpenCodeSession();
  const activeServerId = useServerStore((s) => s.activeServerId);

  const [uploadedPath, setUploadedPath] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string>('');

  const host = useMemo(() => {
    if (typeof window === 'undefined') return 'localhost:3000';
    return window.location.host;
  }, []);

  const handleFile = async (file: File) => {
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      setError('Only CSV / XLS / XLSX files are supported.');
      return;
    }
    if (file.size === 0) {
      setError('File is empty.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum 10MB.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const result = await uploadFile(file, '/workspace/uploads');
      const path = Array.isArray(result) ? result[0]?.path : undefined;
      if (!path) {
        setError('Upload succeeded but server returned no path.');
        return;
      }
      setUploadedPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      setError('Please drop one file at a time.');
      return;
    }
    await handleFile(files[0]);
  };

  const onAnalyze = async () => {
    if (!uploadedPath) return;
    setIsAnalyzing(true);
    try {
      const prompt = buildShadowAnalyzePrompt(uploadedPath, host);
      await dispatchShadowPrompt(
        createSession.mutateAsync,
        prompt,
        'Shadow Account analysis',
        openTabAndNavigate,
        activeServerId,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-in fade-in zoom-in duration-500 ease-out">
      <PageHeader icon={Activity}>Shadow Account</PageHeader>

      {blocked ? (
        <TierGateBanner feature="Shadow Account" />
      ) : (
        <div className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="rounded-xl border border-dashed border-border/60 p-8 text-center bg-muted/20"
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              Upload CSV/XLS/XLSX from 同花顺, 东财, 富途 or generic broker export (max 10MB)
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="block w-full text-sm"
            />
          </div>

          {uploadedPath && (
            <p className="text-sm text-muted-foreground">Uploaded to: {uploadedPath}</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={onAnalyze} disabled={!uploadedPath || uploading || isAnalyzing}>
            {(uploading || isAnalyzing) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Analyze with AI
          </Button>
        </div>
      )}
    </div>
  );
}
