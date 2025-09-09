// Configure a server endpoint that accepts multipart/form-data { file: audio }
// and returns JSON: { text: "recognized transcript" }
// Tip: Implement this as a Supabase Edge Function or your own backend (keeps API keys secret).
export const STT_ENDPOINT = null; // e.g., 'https://<your-edge-url>/transcribe'
