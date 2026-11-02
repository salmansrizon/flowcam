"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_NARRATION_MS, type Narration } from "@flowcam/domain";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readAsset, writeAsset } from "../presentation/assets";
import { MAX_SILENCE_S, MIN_SILENCE_S } from "./timing";

/** Length of a recorded blob, measured by decoding it (a MediaRecorder file carries no duration). */
async function measureMs(blob: Blob): Promise<number> {
  const buf = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(await blob.arrayBuffer());
  return Math.round(buf.duration * 1000);
}

/**
 * The Script tab's Narration controls for one Step: record the voice (Script shown large, with a level meter),
 * play it back, re-record, delete, or set silence for a time. `onChange` should go through the editor's undo path.
 */
export function NarrationControls({ script, narration, onChange }: { script: string; narration: Narration | undefined; onChange: (n: Narration | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [silenceS, setSilenceS] = useState("3");
  const stopRef = useRef<(() => void) | null>(null);
  const assetId = narration?.kind === "voice" ? narration.assetId : null;

  useEffect(() => () => stopRef.current?.(), []);

  useEffect(() => {
    if (!assetId) return;
    let url: string | null = null;
    let alive = true;
    readAsset(assetId)
      .then((b) => {
        if (alive) setPlayUrl((url = URL.createObjectURL(b)));
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId]);

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError("The microphone is not available. Allow microphone access and try again.");
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const meter = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      setLevel(Math.min(1, Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) * 4));
    }, 50);
    const limit = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), MAX_NARRATION_MS);

    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      clearInterval(meter);
      clearTimeout(limit);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      stopRef.current = null;
      setRecording(false);
      setLevel(0);
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const durationMs = await measureMs(blob);
        if (durationMs < 100) return setError("Nothing was recorded.");
        onChange({ kind: "voice", assetId: await writeAsset(blob), durationMs });
      } catch (e) {
        setError(`Could not save the recording: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    stopRef.current = () => recorder.state !== "inactive" && recorder.stop();
    recorder.start();
    setRecording(true);
  }

  const silence = Number(silenceS);
  const silenceOk = silence >= MIN_SILENCE_S && silence <= MAX_SILENCE_S;

  return (
    <div className="flex flex-col gap-2" aria-label="Narration">
      <h4 className="text-xs font-medium text-muted-foreground">Narration</h4>

      {recording && (
        <div role="dialog" aria-label="Recording narration" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background p-12">
          <p className="max-w-4xl whitespace-pre-wrap text-center text-4xl leading-snug font-medium">{script || "(No Script for this Step. Just speak.)"}</p>
          <div role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level} className="h-3 w-80 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <Button size="lg" variant="destructive" onClick={() => stopRef.current?.()}><Square /> Stop</Button>
        </div>
      )}

      {narration?.kind === "voice" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">Voice, {(narration.durationMs / 1000).toFixed(1)} s</p>
          {assetId && playUrl && <audio aria-label="Narration playback" controls src={playUrl} className="w-full" />}
        </div>
      )}
      {narration?.kind === "silence" && <p className="text-sm">Silence, {(narration.durationMs / 1000).toFixed(1)} s</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={start}><Mic /> {narration?.kind === "voice" ? "Re-record" : "Record narration"}</Button>
        {narration && <Button size="sm" variant="outline" onClick={() => onChange(null)}><Trash2 /> Delete</Button>}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="silence-s">Silence for</label>
        <Input id="silence-s" type="number" step={0.5} min={MIN_SILENCE_S} max={MAX_SILENCE_S} value={silenceS} onChange={(e) => setSilenceS(e.target.value)} className="h-7 w-16" />
        <span>s</span>
        <Button size="sm" variant="outline" disabled={!silenceOk} onClick={() => onChange({ kind: "silence", durationMs: Math.round(silence * 1000) })}>Set</Button>
      </div>
      {!silenceOk && <p className="text-xs text-destructive">Silence runs from {MIN_SILENCE_S} to {MAX_SILENCE_S} seconds.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Voice Narrations stay on this device for now. They are not synced to your account.</p>
    </div>
  );
}
