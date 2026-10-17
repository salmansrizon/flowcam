import {
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
} from "mediabunny";

export interface ClipCapture {
  /**
   * Ends the Clip and finishes media.mp4. Times are `performance.now()` ms: `mediaStartMs` is the instant that is
   * t=0 in the media file, `endMs` when the Clip was ended.
   */
  finish(): Promise<{ mediaStartMs: number; endMs: number }>;
  /** Stops capturing and closes the file without finishing it. */
  cancel(): Promise<void>;
}

// Most widely playable first; the browser's first encodable codec wins (e.g. Chromium on Linux has no AAC encoder).
const VIDEO_CODECS = ["avc", "vp9", "av1"] as const;
const AUDIO_CODECS = ["aac", "opus"] as const;

/**
 * Records the stream's Camera and Microphone into `file` as fragmented MP4. Each fragment (about 1 s) is written as
 * soon as it is complete, rather than holding the whole Clip in memory.
 */
export async function startClipCapture(
  stream: MediaStream,
  file: FileSystemWritableFileStream,
  onError: (error: unknown) => void,
): Promise<ClipCapture> {
  const [videoTrack] = stream.getVideoTracks();
  const [audioTrack] = stream.getAudioTracks();
  const format = new Mp4OutputFormat({ fastStart: "fragmented" });
  const { width, height } = videoTrack.getSettings();
  const videoCodec = await getFirstEncodableVideoCodec(
    VIDEO_CODECS.filter((c) => format.getSupportedVideoCodecs().includes(c)),
    { width, height, quality: QUALITY_HIGH },
  );
  const audioCodec = await getFirstEncodableAudioCodec(
    AUDIO_CODECS.filter((c) => format.getSupportedAudioCodecs().includes(c)),
    { quality: QUALITY_HIGH },
  );
  if (!videoCodec || !audioCodec) throw new Error("This browser cannot encode camera video and microphone audio.");

  const output = new Output({ format, target: new StreamTarget(file) });
  // Both sources use the default timestampBase "synced-zero": the first sample to arrive from either track is t=0
  // and the other track is offset against it, so audio and video share one timeline.
  const video = new MediaStreamVideoTrackSource(videoTrack, { codec: videoCodec, quality: QUALITY_HIGH });
  const audio = new MediaStreamAudioTrackSource(audioTrack, { codec: audioCodec, quality: QUALITY_HIGH });
  video.errorPromise.catch(onError);
  audio.errorPromise.catch(onError);
  output.addVideoTrack(video);
  output.addAudioTrack(audio);
  await output.start();

  return {
    async finish() {
      const endMs = performance.now();
      await output.finalize();
      // How the log clock meets the media timeline: with "synced-zero", mediabunny stamps the first media sample
      // t=0 and stores the `performance.now()` of its arrival (in seconds) on the Output as
      // `_firstMediaStreamTimestamp` (see mediabunny src/media-source.ts). The Presenter View stamps every log
      // event with the same `performance.now()` clock, so subtracting this instant puts log t=0 on the first
      // media sample. The field is internal to mediabunny, hence the cast; check it on mediabunny upgrades.
      const firstSampleS = (output as unknown as { _firstMediaStreamTimestamp: number | null })._firstMediaStreamTimestamp;
      if (typeof firstSampleS !== "number") throw new Error("The Clip ended before any camera or microphone data arrived.");
      return { mediaStartMs: firstSampleS * 1000, endMs };
    },
    cancel: () => output.cancel(),
  };
}
