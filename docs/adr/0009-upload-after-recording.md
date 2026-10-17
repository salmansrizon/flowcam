# Upload once after recording, and send the final video straight to Mux

A Pro user's Recording is uploaded in the background after recording stops, not while recording: the Board log first (tiny data), then the Camera and Microphone Tracks compressed once to a Sync quality of about 20 MB per minute, while the final exported video goes from the browser directly to Mux and never passes through our servers. We rejected Cap-style live chunked upload, which gives an instant Share Link but stores and transfers two to three times as much, and rejected uploading only the final video, which would break Sync and resuming an edit on the web.

## Consequences

- A new Share Link shows "processing" for about a minute before it plays.
- Raw full-quality camera footage stays only on the recording device; cloud copies are at Sync quality.
