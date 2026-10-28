# Live lecture transcription: measurements and recommendation

Measured on 2026-10-27 (local time) on the operator's Mac (arm64). Token Factory spend for this task: $0.00061. OpenRouter spend: $0.

## Short answer

1. Token Factory has no speech model and no audio endpoint. It cannot transcribe.
2. The one hosted NVIDIA speech model our keys reach is Nemotron 3 Nano Omni (free) on OpenRouter. Every audio request failed with HTTP 402: OpenRouter needs at least $0.50 of account balance for audio, and our account has never bought credit. Its only endpoint was also down (0% uptime over the last 30 minutes, 8.7% over 24 hours). I could not measure its latency or accuracy.
3. The Token Factory text step works and is cheap. Lightning finds the exam hints in 0.8 to 2.1 s per call, at about $0.02 per lecture hour.
4. Browser capture works headlessly. MediaRecorder must stop and restart per chunk; timeslice chunks after the first do not decode on their own.
5. Recommendation: run NVIDIA Parakeet locally for speech (server route first, browser as an option). Use Token Factory Lightning for punctuation, exam hints and tasks. A one-hour spike is needed first, because the model download (454 to 661 MB) needs operator approval.

## 1. Token Factory: no speech path

| Check | Result |
| --- | --- |
| `GET /v1/models` | 30 models. Modalities are only `text->text`, `text+image->text` and `text->embedding`. No whisper, parakeet, canary or omni. |
| NVIDIA models listed | `NVIDIA-Nemotron-3-Nano-30B-A3B`, `Nemotron-3-Ultra-550b-a55b`, `Nemotron-3.5-Super-VL`, `Nemotron-3_5-Lightning`, `nemotron-3-super-120b-a12b` |
| `POST /v1/audio/transcriptions` | HTTP 404 `{"detail":"Not Found"}` for `whisper-1`, `openai/whisper-large-v3`, `nvidia/parakeet-tdt-0.6b-v2`, `nvidia/canary-1b`. `GET` is also 404. The route does not exist. |
| `GET /openapi.json` | No `/v1/audio/*` path. Inference paths are chat/completions, completions, embeddings, rerank and responses. |
| Docs index (`docs.tokenfactory.nebius.com/llms.txt`) | No audio, speech or transcription page. The only multimodal page is "Vision capabilities". |
| `input_audio` part to `Nemotron-3.5-Super-VL` chat | HTTP 422 in 1.5 s. Allowed content part types are `text`, `image_url` and `video_url`. Not billed. |
| Dedicated endpoint templates (`GET /v0/dedicated_endpoints/templates`) | 75 templates. One is `nvidia/Nemotron-3-Nano-Omni` (FP8, H100 in eu-north1 or H200 in us-central1, 1 to 8 GPUs). Its listed use cases are text, image, reasoning, function calling, code, RAG and responses. Audio is not listed. Not deployed: it bills per GPU hour, far outside this task's $0.30 budget. |

So the hackathon's Token Factory call has to be a text step after transcription.

## 2. Test audio

Made with macOS `say` (default voice) from a 259-word calculus lecture on integration by parts. It includes "this will be on Term Test 2", a common-mistake warning, a reading assignment and office hours. All files are in `scripts/fixtures/`.

| File | What it is |
| --- | --- |
| `lecture.txt` | Reference script for word error rate (WER) |
| `lecture.wav` | 78.6 s, 16 kHz mono 16-bit PCM, 2.5 MB |
| `lecture.mp3` | 48 kbps, 472 KB |
| `lecture.webm` | Opus 32 kbps, 320 KB |
| `lecture-noisy.wav` | Same speech with pink noise mixed in (ffmpeg `anoisesrc` amplitude 0.03) |
| `chunks15/chunk00..05.wav` | 15 s chunks, last one 3.6 s |
| `chunks30/chunk00..02.wav` | 30 s chunks, last one 18.6 s |
| `mediarecorder/restart-00.webm`, `restart-01.webm` | Real Chromium MediaRecorder output (fake mic fed `lecture.wav`), 15 s each, about 58 KB, each decodes on its own |
| `mediarecorder/timeslice-01-headerless.webm` | Second blob from a timeslice recorder. Does not decode on its own. Use it as a negative test. |

The "Term Test 2" line is at about 53 s (estimated from word rate). It falls in `chunks15/chunk03.wav` and `chunks30/chunk01.wav`.

## 3. Nemotron 3 Nano Omni on OpenRouter (blocked)

Model `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`. OpenRouter lists inputs text, audio, image and video, 256k context, and the `reasoning` parameter. It does not list `response_format`, so JSON output can only be asked for in the prompt.

| Request | Result |
| --- | --- |
| Full `lecture.wav` (2.5 MB), reasoning off | HTTP 402 in 1,784 ms |
| `chunks15/chunk05.wav` (115 KB), reasoning off | HTTP 402 in 141 ms |
| Full `lecture.mp3`, reasoning off | HTTP 402 in 149 ms |

The error each time: `This request requires at least $0.50 in balance for audio` (`limit_source: openrouter_credits`). `GET /api/v1/key` reports `is_free_tier: true`, key limit $0.10, usage $0.

Endpoint health from `GET /api/v1/models/<id>/endpoints` at 00:33 UTC: one provider (Nvidia), status -5, uptime 0% for the last 5 and 30 minutes, 8.7% for the last day.

Free-tier limits from OpenRouter's docs: 20 requests per minute, and 50 requests per day for accounts that bought less than $10 of credit (1,000 per day at $10 or more). The limit is per account, not per model. A one-hour lecture is 240 requests at 15 s chunks or 120 at 30 s chunks. Both exceed 50 per day.

Not measured, because of the 402: latency, WER, timestamped JSON, 15 s versus 30 s chunks, reasoning on versus off. What the model card claims: WAV and MP3 input up to 1 hour at 8 kHz or more, word-level timestamps for transcription, and a Parakeet speech encoder. Thinking is off with `chat_template_kwargs: {enable_thinking: false}` on vLLM, or `reasoning: {enabled: false}` on OpenRouter.

The request that should work once the account has credit:

```js
{
  model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  temperature: 0,
  reasoning: { enabled: false },
  messages: [{ role: "user", content: [
    { type: "text", text: "Transcribe this lecture audio verbatim. Output only the transcript text." },
    { type: "input_audio", input_audio: { data: base64Wav, format: "wav" } },
  ] }],
}
```

OpenRouter accepts `wav`, `mp3`, `aiff`, `aac`, `ogg` (Vorbis), `flac`, `m4a`, `pcm16` and `pcm24`. It does not accept WebM or Opus, which is what Chrome's MediaRecorder produces.

WER method for the rerun: lowercase, strip punctuation, spell out digits, then word-level edit distance against `lecture.txt`.

## 4. Token Factory text step (measured)

Input was simulated CTC output: `lecture.txt` lowercased with punctuation removed and numbers spelled out. This is the shape Parakeet CTC returns. It measures the text step only, not speech recognition errors. All runs used `temperature: 0` and thinking off (`chat_template_kwargs: {enable_thinking: false}`).

| Run | Model | Input | Tokens in / out | Latency | Cost |
| --- | --- | --- | --- | --- | --- |
| JSON (text, examHints, tasks) | Lightning | 50-word chunk with "term test two" | 269 / 120, 154, 105 | 1,097, 1,305, 842 ms | $0.00004 to $0.00005 |
| JSON (text, examHints, tasks) | Lightning | full 259 words | 484 / 415, 445 | 1,804, 2,104 ms | $0.00013 |
| Punctuation only, plain text | Lightning | full 259 words | 354 / 288 | 1,392 ms | $0.00009 |
| JSON (text, examHints, tasks) | Nano 30B | full 259 words | 484 / 366 | 1,556 ms | $0.00012 |

Quality:

- **Lightning, JSON prompt.** Found all 3 exam hints in both runs: "this will be on term test two", "at least one question where you have to apply integration by parts twice", and "students always forget the minus sign on the second step". Found the 3 tasks (read section 7.1, odd problems 1 to 20, office hours Thursday at 3 in room 240). But its `text` field came back as the raw lowercase words with no punctuation.
- **Lightning, punctuation-only prompt.** Added sentences and capitals and kept 250 of 259 words in order. It wrote "Term Test 2" and "section 7.1". It left "two forty" and the spoken math as words.
- **Nano 30B, JSON prompt.** Punctuated and used digits and math notation, but kept only 167 of 259 words. It summarized instead of transcribing. It found 2 of 3 hints. Do not use it for this step.

So use two Lightning prompts: one that punctuates each chunk, and one that extracts hints and tasks from a rolling window.

Cost estimate from these token counts, per lecture hour at 15 s chunks: 240 punctuation calls (about 180 in, 80 out) plus 240 hint calls over a 60 s window (about 420 in, 150 out) comes to about $0.022. The $30 cap in `lib/spend.ts` covers over 1,000 lecture hours.

## 5. Browser capture (measured)

Run in Playwright 1.64 with Chrome for Testing 153 headless and with `chrome-headless-shell` 1243, fake mic fed from `lecture.wav`, page on `http://localhost`.

| Check | Result |
| --- | --- |
| Track settings | 44,100 Hz, 2 channels. Chromium resamples the 16 kHz mono file. |
| `MediaRecorder.isTypeSupported` | `audio/webm;codecs=opus` yes, `audio/webm` yes, `audio/mp4` yes, `audio/mp4;codecs=mp4a.40.2` yes, `audio/ogg;codecs=opus` no, `audio/wav` no |
| One recorder, `start(15000)` timeslice | Blob 0: 57.8 KB, decodes to 15.0 s. Blob 1: 57.2 KB, ffmpeg fails with "EBML header parsing failed". Blob 0 and 1 joined decode to 30 s. |
| Stop and restart every 15 s | Each blob about 57.9 KB and decodes on its own to 15.0 s |
| ffmpeg WebM to 16 kHz mono WAV | 46 ms per 15 s chunk |
| WebGPU | Chrome for Testing headless: hardware adapter `apple/metal-3`. `chrome-headless-shell`: only `google/swiftshader` (software). |

Where fixed cuts land in `lecture.wav`: all five cuts at 15, 30, 45, 60 and 75 s fall mid-speech (level 7% to 78% of peak). Each has a pause of 200 ms or more within 2.3 s (at 14.3, 28.9, 45.9, 57.7 and 75.5 s). Cutting at the quietest point between 12 and 18 s would avoid split words. Synthetic speech pauses more regularly than a real lecturer, so keep a hard cut at 18 s.

## 6. NVIDIA speech models we could run ourselves (not tested)

| Option | Weights | Output | Notes |
| --- | --- | --- | --- |
| `@huggingface/transformers` 4.3.2 (transformers.js) with `onnx-community/parakeet-ctc-0.6b-ONNX` | q4f16 454 MB, int8 611 MB, fp16 1.2 GB, fp32 2.4 GB | Lowercase, no punctuation | Official support: the ASR pipeline handles `parakeet_ctc`. It runs greedy CTC and ignores `return_timestamps` and `chunk_length_s`, so we chunk ourselves and get chunk-level times only. Runs in the browser on WebGPU or WASM, or in Node. |
| Parakeet TDT 0.6B v2 ONNX (`istupakov/parakeet-tdt-0.6b-v2-onnx`) | encoder int8 652 MB, decoder 9 MB | Punctuation, capitals, word timestamps (English) | transformers.js does not support TDT. In the browser it needs our own TDT decode loop on onnxruntime-web or a community port (`striimit/parakeet-tdt-0.6b-v3-webgpu`, fp16 encoder 1.24 GB). Community code, unreviewed. |
| sherpa-onnx (`sherpa-onnx-node`) with `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8` | encoder 652 MB, decoder 7.3 MB, joiner 1.7 MB | Punctuation, capitals, timestamps | Runs on CPU inside our Node server. Too big to bundle into a typical serverless function (Vercel caps functions at 250 MB unzipped), so it suits a local demo or a VM. |
| `nvidia/nemotron-speech-streaming-en-0.6b` | NeMo checkpoint | Streaming ASR, 1.12 s frames on the model card | Ports exist for GGUF, MLX and LiteRT. I found no ONNX or browser port. |

All Parakeet weights above are CC-BY-4.0.

No feasibility test was run. The smallest weights are 454 MB, which is not cheap, and downloading them needs operator approval.

## 7. Web Speech API (measured, not recommended)

- Chrome for Testing headless: `webkitSpeechRecognition` exists. Cloud recognition fired `start` and `audiostart`, then gave no result and no error in 8 s. Chrome for Testing has no Google speech key. `SpeechRecognition.available({langs: ["en-US"], processLocally: true})` returned `"downloadable"`: the on-device language pack is not installed.
- `chrome-headless-shell`: calling `SpeechRecognition.available()` crashed the renderer ("Target crashed").
- In regular Chrome, cloud recognition streams the lecture audio to Google. On-device mode first downloads a language pack from Google. Neither is an NVIDIA model.

It fails the NVIDIA preference, sends student audio to a third party, and cannot run in our headless gate. Use it only as a clearly labeled last resort, or not at all.

## 8. Recommended pipeline

```
Browser                                   Server (Next route handler)                Token Factory
getUserMedia
  -> MediaRecorder audio/webm;codecs=opus,
     stop and restart at the quietest point
     between 12 and 18 s (AnalyserNode RMS)
  -> keep every chunk in IndexedDB
  -> POST /api/lecture/chunk               -> decode to 16 kHz mono PCM (ffmpeg, 46 ms)
     {lectureId, seq, startMs, audio}      -> transcribeChunk(pcm, startMs)
                                              Parakeet TDT 0.6B v2 int8 via sherpa-onnx
                                           -> text with punctuation and word times
                                           -> every chunk: hints and tasks over the     -> Nemotron-3_5-Lightning,
                                              last 60 s of text                             thinking off, JSON
                                           <- {seq, segments, examHints, tasks}
```

- One interface, `transcribeChunk(pcm16k, startMs) -> { text, words? }`, with one adapter per engine. Parakeet TDT on the server is the first adapter. The others are listed under fallbacks.
- With a CTC engine (transformers.js or Omni), add the Lightning punctuation call per chunk (measured 0.8 to 1.4 s, about $0.00003). TDT already punctuates.
- Hints and tasks run on the rolling 60 s window so a hint that spans a cut is still seen. Deduplicate by quote.
- Send everything through `lib/llm.ts` so the `reserve()` and `settle()` spending cap applies.
- Expected lag from speech to text: chunk length (12 to 18 s) plus ASR plus about 1 s for Lightning. ASR time is not measured yet; the spike sets a 1.5 s target per 15 s chunk. With local ASR there is no rate limit, so shorter chunks (5 s) are possible if the lag feels too long.
- Cost: about $0.02 per lecture hour on Token Factory. ASR is local, so it costs nothing per call.

Spike before building (about one hour, needs operator approval for the downloads):

1. Install `sherpa-onnx-node` and download `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8` (661 MB).
2. Transcribe `lecture.wav`, `lecture-noisy.wav`, `chunks15/*`, `chunks30/*` and `mediarecorder/restart-0*.webm`.
3. Accept if WER is 10% or less on `lecture.wav`, the `chunk03` text contains "term test 2" (or "two"), and each 15 s chunk takes 1.5 s or less on the demo laptop.
4. Rerun the same harness on Omni if the operator adds OpenRouter credit, so the two can be compared on the same fixtures.

## 9. Fallbacks

1. **Omni on OpenRouter.** Same OpenAI SDK, one extra content part. Usable only after the operator adds credit (at least $0.50 for audio, $10 lifetime for 1,000 requests per day), and only while its endpoint is up. Check `/endpoints` uptime before choosing it. Convert chunks to WAV first.
2. **Parakeet CTC in the browser** (transformers.js, 454 MB q4f16). Audio never leaves the device. Needs WebGPU for speed and a Lightning punctuation pass. The model download should start before class, not when the lecture starts.
3. **Transcribe after class.** Every chunk is already in IndexedDB, so if live ASR fails, the notes are made when ASR is back. No audio is lost.
4. **Demo and test mode.** With no ASR configured, replay `lecture.txt` in timed chunks, the same way `lib/mock.ts` stands in for the other model roles.

## 10. Testing headlessly

```js
const browser = await chromium.launch({
  executablePath, // Chrome for Testing if the test needs WebGPU; chrome-headless-shell is fine for capture
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${wavPath}%noloop`,
  ],
});
```

- `wavPath` must be absolute. Playwright passes `args` as an array, so the space in the project path needs no quoting. In a shell, quote the whole flag.
- Without `%noloop` the file loops. Chromium 1243 accepted the suffix. My run was shorter than the file, so I did not observe the end-of-file behavior.
- The page must be a secure context. `http://localhost` works.
- Expect 44.1 kHz stereo from the fake mic, not the file's 16 kHz mono.
- Use `chrome-headless-shell` for capture tests. Use Chrome for Testing headless for anything that needs WebGPU. Do not call `SpeechRecognition.available()` in the headless shell; it crashes the tab.
- Test the server route without a browser by posting `scripts/fixtures/mediarecorder/restart-00.webm`. Post `timeslice-01-headerless.webm` and expect a clear 400.

## 11. Decisions for the operator

1. Approve the spike downloads: `sherpa-onnx-node` and the 661 MB Parakeet TDT int8 model. Optionally also the 454 MB transformers.js CTC model for the in-browser option.
2. Decide whether to add OpenRouter credit so Omni can be measured. I did not, because it is a purchase.
3. Decide whether a Nebius dedicated Omni endpoint is worth GPU-hour billing. I did not price or deploy it, and its template does not list audio.

## 12. Spend

| Provider | Calls | Tokens in / out | Cost |
| --- | --- | --- | --- |
| Token Factory | 7 billed (plus one 422 rejected at validation, no usage) | 2,613 / 1,893 | $0.00061 |
| OpenRouter | 3 audio requests, all rejected with 402 before inference | none | $0 |

Prices from `lib/spend.ts`: Lightning and Nano 30B at $0.06 in and $0.24 out per million tokens. `.data/spend-ledger.json` went from $0.03003366 (17 calls) to $0.03064476 (24 calls).

Sources: Token Factory `/v1/models`, `/openapi.json`, `/v0/dedicated_endpoints/templates` and `docs.tokenfactory.nebius.com/llms.txt`; OpenRouter `/api/v1/models`, the model's `/endpoints`, and the docs pages on [audio inputs](https://openrouter.ai/docs/guides/overview/multimodal/audio) and [limits](https://openrouter.ai/docs/api/reference/limits); Hugging Face model cards and file listings for `nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-FP8`, `onnx-community/parakeet-ctc-0.6b-ONNX`, `istupakov/parakeet-tdt-0.6b-v2-onnx`, `istupakov/parakeet-tdt-0.6b-v3-onnx`, `striimit/parakeet-tdt-0.6b-v3-webgpu`, `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8` and `nvidia/nemotron-speech-streaming-en-0.6b`; transformers.js source `packages/transformers/src/pipelines/automatic-speech-recognition.js`.
