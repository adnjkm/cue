# Nebius Token Factory for Cue: live capability map

Measured on 2026-10-27 (local time) against `https://api.tokenfactory.nebius.com/v1` with `NEBIUS_API_KEY`. 166 billed calls. Token Factory spend for this task: $0.1014 at list input and output prices ($0.1008 after cached-token discounts). The probe scripts were throwaway and live outside the repo.

Already known before this task, so not re-measured: all five Nemotron chat models answer. `chat_template_kwargs: {enable_thinking: false}` turns thinking off. A `/no_think` system line does not. Ultra with thinking on returns `content` plus `reasoning_content`.

## Short answer

1. The prices in `lib/spend.ts` are correct for all five Nemotron models. Three smaller gaps are listed in section 1.3.
2. `nvidia/nemotron-3-super-120b-a12b` and `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` leave serverless on **2026-11-09**. Do not build on them.
3. `response_format` `json_schema` constrains output on every Nemotron model, strict or not, with thinking on or off. With thinking on, the prompt must also describe the JSON. Otherwise the reasoning plans prose, and the forced JSON comes out wrong.
4. Tool calling works on all five. Three `tool_choice` edge cases misbehave (section 2.3).
5. Streaming with `stream_options.include_usage` returns usage on all five. It arrives in a final chunk with `choices: []`.
6. Super VL takes at most **8 images** per request and about 10 MiB per image. It does not accept PDFs. One image costs 272 to 3,317 prompt tokens, depending on pixel count.
7. The only embedding model is `Qwen/Qwen3-Embedding-8B` (4,096 dims, `dimensions` works). There is no NVIDIA embedding model and no reranker of any kind.
8. Ultra is the fastest strong model: 0.5 to 0.7 s to the first token and 300 to 340 tokens/s. With thinking on it usually reasons briefly, and it scored 4/4 on the MCQ set. Lightning with thinking off scored only 1/4, so it should not explain answers.
9. There is no speech-to-text on Token Factory. See `docs/research/transcription.md`.

## 1. Models and prices

### 1.1 The catalog

`GET /v1/models?verbose=true` returns 30 models with context length, modality, quantization, pricing, per-model limits, region and supported features. Plain `GET /v1/models` returns only id, created and owner. Prices below are from that metadata and match the public catalog pages (`tokenfactory.nebius.com/models/catalog/...`), checked in a browser. The organization price page needs a login.

| Model id | Context | Modality | Quant | Region | RPM / TPM | $/M input | $/M cached | $/M output | Catalog speed | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nvidia/Nemotron-3.5-Super-VL` | 1,048,576 | text+image->text | bf16 | us-north1 | 1,000 / 2M | 0.30 | 0.06 | 0.90 | 282 tok/s | active |
| `nvidia/Nemotron-3_5-Lightning` | 1,048,576 | text->text | bf16 | eu-north1 | 1,000 / 2M | 0.06 | 0.03 | 0.24 | 314 tok/s | active |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | 1,048,576 | text->text | fp4 | us-central1 | 1,000 / 2M | 1.00 | 0.12 | 3.00 | 523 tok/s | active |
| `nvidia/nemotron-3-super-120b-a12b` | 262,144 | text->text | fp4 | us-central1 | 1,000 / 1M | 0.30 | 0.06 | 0.90 | 127 tok/s | removed 2026-11-09, replacement Super VL |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | 262,144 | text->text | fp8 | eu-north1 | 100 / 800k | 0.06 | 0.012 | 0.24 | 60 tok/s | removed 2026-11-09, replacement Lightning |
| `Qwen/Qwen3-Embedding-8B` | 40,960 | text->embedding | n/a | eu-north1 | 10,000 / 600k | 0.01 | n/a | 0 | n/a | active |

The other 24 models are not NVIDIA: Kimi, Qwen, DeepSeek, GLM, MiniMax, gpt-oss, Gemma, Hermes, MiniCPM-V, reflection/beam and muse-spark. The metadata lists `supported_features: ["tools", "reasoning"]` for every Nemotron model and never lists `json_mode` or `structured_outputs`. Both still work (section 2).

Image price is 0. Images are billed as prompt tokens (section 4). No Nemotron model has a `-fast` flavor: `-fast` ids return 404 `model_not_found`.

### 1.2 Price check against `lib/spend.ts`

| Model | `spend.ts` [in, out] | Official [in, out] | Verdict |
| --- | --- | --- | --- |
| Super VL | 0.3, 0.9 | 0.30, 0.90 | correct |
| Lightning | 0.06, 0.24 | 0.06, 0.24 | correct |
| Ultra | 1, 3 | 1.00, 3.00 | correct |
| Super 120B | 0.3, 0.9 | 0.30, 0.90 | correct |
| Nano | 0.06, 0.24 | 0.06, 0.24 | correct |

### 1.3 Gaps in `lib/spend.ts` (not fixed here; app code is out of scope)

1. **Embeddings are missing from `PRICES`.** If embeddings go through `reserve()`, they fall back to $1/M input, 100 times the real $0.01/M. Add `"Qwen/Qwen3-Embedding-8B": [0.01, 0]`.
2. **`IMAGE_TOKENS = 3000` is below the measured cap of 3,317 tokens per image.** The worst-case hold is about 10% low per image. The dollar gap is under $0.0001 per image on Super VL, but 3,400 would make the hold a true worst case.
3. **Cached input is not modeled.** Cache hits bill at 20% (Super VL), 50% (Lightning) or 12% (Ultra) of the input price. The ledger therefore overstates spend a little, which is the safe direction. Measured: a repeated 5,868-token prefix got 2,176 cached tokens on Super VL, 2,096 on Lightning and 0 on Ultra. Caching is best-effort.
4. `max_tokens` covers reasoning plus answer. A Nano thinking run spent all 6,000 tokens on reasoning and returned no content. Reserving on `max_tokens` is therefore a true upper bound.

## 2. Structured output and tool calling

### 2.1 `response_format`, thinking off

Test prompt: "Which planet is the largest? A) Mars B) Jupiter C) Venus D) Earth. Answer with the full planet name in a friendly sentence, give your confidence as words like 'very sure', and list six related topics." The prompt never mentions JSON and asks for three things the schema forbids. The schema requires `answer` in an enum A to D, `confidence` as an integer from 0 to 100, and `topics` with 1 to 3 items, with `additionalProperties: false`.

| Model | `json_schema` strict | `json_schema` non-strict | `json_object` | no format |
| --- | --- | --- | --- | --- |
| Super VL | conforms, B | conforms, B | valid JSON, own keys, 6 topics, `"very sure"` | prose |
| Lightning | conforms, B | conforms, B | returned `{}` | prose |
| Ultra | conforms, B | conforms, B | valid JSON, own keys | not run |
| Super 120B | conforms, B | conforms, B | valid JSON, own keys | not run |
| Nano | conforms, B | conforms, A | valid JSON, own keys | not run |

Both strict and non-strict schemas are enforced by the server, so the output is constrained, not just requested. `json_object` only guarantees valid JSON. Use `json_schema` everywhere. Latency was 1.3 to 2.7 s.

### 2.2 `response_format` with thinking on

The grammar applies to `content` only. Reasoning is unconstrained.

- With the prompt above, all four models (Super VL, Lightning, Ultra, Super 120B) returned schema-valid JSON, but every one answered **"A"**, the first enum value. The reasoning had planned a prose answer saying "Jupiter", and the constrained answer did not follow it.
- With the prompt rewritten to describe the JSON shape, all four answered "B" in 1.2 to 2.0 s.

Rule for Cue: when thinking is on, always describe the JSON in the system prompt as well as in `response_format`.

### 2.2a Line breaks inside strings under `json_schema` (measured 2026-10-28)

The grammar keeps line breaks out of JSON strings. Whatever the prompt asks, a constrained string comes back on one line, and code is dropped or flattened.

| Task and model | With `json_schema` | Schema in the prompt only |
| --- | --- | --- |
| `practice.parse`, Super VL, a page whose text layer holds a 4-line Python function | prompt kept the stem and lost the whole code block | prompt kept the fenced block with every line and its indentation |
| `practice.generate`, Ultra, thinking on | code fences present, every line break gone (` ```pythondef inorder(node):    if node…`) | fenced blocks with line breaks |
| `practice.generate`, Ultra, thinking off | the model wrote no code at all | not run |

Rule for Cue: a task whose strings carry code, page text or paragraphs sets `multiline: true`. The server then states the schema in the system prompt only and relies on validation (and, for JSON tasks, one repair turn). Every other task keeps the grammar. `lib/ai/mocks.test.ts` fails when a task's mock output contains a line break and the task does not set the flag.

### 2.3 Tools

Two tools: `get_course_schedule(course, week)` and `create_study_session(course, start, minutes enum)`. Thinking was off unless noted.

| Case | Super VL | Lightning | Ultra | Super 120B | Nano |
| --- | --- | --- | --- | --- | --- |
| `auto`, needs a tool | ok | ok | ok | ok, plus a preamble sentence in `content` | ok |
| `required`, small talk | ok (invents week 1) | **fails**: 12 calls in a loop, `finish_reason: length`, raw `<tool_call>` XML in `content` | ok | ok | ok |
| named function | ok | ok | ok | ok | ok, but `finish_reason: stop` |
| `none` | ok, text answer | ok | **fails**: `content` is `" "` | ok, but took 16.3 s | **fails**: raw `<tool_call>` XML in `content` |
| two calls needed | 2 parallel calls | 2 parallel calls | 2 parallel calls | 2 parallel calls | 2 parallel calls |
| `auto`, small talk | no call | no call | no call | no call | no call |
| tool result sent back | correct answer | correct answer | correct answer | correct answer | not run |
| `auto`, thinking on | ok, 2.3 s | ok, 0.8 s | ok, 1.2 s | not run | not run |

Every argument string parsed as JSON and respected the enum. Rules for Cue: do not send `tool_choice: "none"`. Leave out `tools` instead. Do not use `required` on Lightning.

## 3. Streaming usage

`stream: true` with `stream_options: {include_usage: true}` returned usage on all five models. It comes in a last chunk with `choices: []`, so the code must not read `choices[0]` from that chunk. Field differences:

| Model | `completion_tokens_details.reasoning_tokens` | `prompt_tokens_details.cached_tokens` |
| --- | --- | --- |
| Super VL | yes | yes |
| Ultra | yes | yes, plus `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens` |
| Super 120B | yes | yes |
| Lightning | yes | `prompt_tokens_details` is `null` when nothing is cached |
| Nano | absent | absent |

Reasoning text field names: Ultra and Super VL use `reasoning_content`. Lightning and Super 120B send both `reasoning` and `reasoning_content`. Super VL streams in bursts: one run delivered 322 tokens in 27 chunks.

## 4. Vision on Super VL

| Check | Result |
| --- | --- |
| Images per request | At most 8. Sending 12 returns 400 "At most 8 image(s) may be provided in one prompt." 8 images worked (6,616 image tokens). |
| Three pages in one request | 2 exam pages plus 1 timetable, 1240 px wide: 5,469 prompt tokens, 2.7 s. Titles and question or block counts were all correct. |
| Tokens per image | About 1 token per 1,024 pixels, minimum 272, maximum 3,317 (about 3.4 MP). 800x1035: 827. 1240x1604: 1,991. 1400x1000: 1,410. 2480x3209 and larger: 3,317. |
| Very large images | 9920x12838 PNG (1.3 MB) and JPEG (3.1 MB) were accepted and downscaled to 3,317 tokens, but took 9.9 to 11.2 s against 1.3 s at 1240 px. |
| Byte limit | Each `image_url.url` string can be at most 13,981,514 characters, so about 10 MiB of image after base64. A 6.3 MB PNG worked. 12 MB and 31 MB PNGs returned 400. |
| Formats | bmp, gif, jpeg, png, tiff, webp, x-portable-pixmap |
| PDF input | Not supported. A `file` or `input_file` part returns 422; the allowed part types are text, `image_url` and `video_url`. A PDF data URL in `image_url` returns 400 with the MIME list above. Render pages to images first (`pdfjs-dist` is already in `node_modules`). |
| Timetable to events | A 1400x1000 weekly grid with `json_schema` strict (enum days, `HH:MM` pattern): 6 of 6 blocks correct, including 13:00 to 14:30, and the midterm note captured. 3.7 s, 1,476 in and 440 out, $0.00084. |
| Usage detail | `prompt_tokens_details.multimodal_tokens.image` reports image tokens. |

Practical page size for Cue: render at 1240 to 1600 px wide. That is about 2,000 to 3,300 tokens per page. Larger pages only add upload time.

One oddity: with thinking off and `max_tokens: 10`, Super VL started its answer with "The user wants me to count...". It was seen once.

## 5. Embeddings and rerank

- Only `Qwen/Qwen3-Embedding-8B`. These NVIDIA ids return 404: `nvidia/llama-nemotron-embed-1b-v2`, `nvidia/NV-Embed-v2`.
- 4,096 dims by default. `dimensions: 1024` and `dimensions: 256` work and return unit-norm vectors. Retrieval quality at reduced dims was not measured. `encoding_format: "base64"` works.
- Price $0.01 per million input tokens. 32 short notes are 479 tokens, about $0.000005.
- Latency for one batch of 32 short texts, 14 samples: min 0.95 s, median 2.65 s, max 10.2 s. A single string took 1.6 s. Embed in the background, not on a keystroke.
- Sanity check: the query "Instruct: Given a student question, retrieve relevant lecture notes\nQuery: how do I know if an infinite sum converges?" ranked "series convergence" first (cosine 0.52), then Taylor series and epsilon-delta proofs.
- Rerank: the OpenAPI spec has `POST /v1/rerank`, but no rerank model is served. `Qwen/Qwen3-Reranker-8B`, `nvidia/llama-nemotron-rerank-1b-v2` and `nvidia/llama-3.2-nv-rerankqa-1b-v2` all return 404. There is no NVIDIA reranker.

## 6. Latency

Streaming, one user message of 43 tokens asking for "about 220 words" on hash-table collisions. Two runs each, shown as run 1 / run 2. Thinking off used `max_tokens: 450`. Thinking on used 6,000.

| Model | Thinking | First answer token (s) | Total (s) | Output tokens (reasoning) | Decode tok/s |
| --- | --- | --- | --- | --- | --- |
| Ultra | off | 0.71 / 0.51 | 2.2 / 1.9 | 450 / 450 (hit cap) | 296 / 336 |
| Ultra | on | 0.54 / 0.69 | 1.4 / 1.6 | 400 (94) / 376 (63) | 350 / 333 |
| Lightning | off | 0.48 / 0.34 | 1.6 / 1.5 | 320 / 331 | 284 / 284 |
| Lightning | on | 10.1 / 4.0 | 11.0 / 5.1 | 3,185 (2,907) / 1,392 (1,051) | 300 / 289 |
| Super VL | off | 1.80 / 0.30 | 4.5 / 3.3 | 322 / 303 | 121 / 101 |
| Super VL | on | 24.3 / 12.1 | 26.1 / 13.3 | 3,762 (3,497) / 2,108 (1,827) | 146 / 180 |
| Super 120B | off | 0.81 / 0.50 | 3.0 / **16.9** (stalled mid-stream) | 355 / 371 | 162 / 23 |
| Super 120B | on | 28.7 / 29.0 | 30.3 / 29.9 | 5,621 (5,361) / 5,866 (5,575) | 189 / 200 |
| Nano | off | 0.45 / 0.32 | 1.5 / 1.5 | 343 / 363 | 338 / 305 |
| Nano | on | never answered / 0.48 | 21.5 / 1.8 | 6,000, all reasoning, no content / 411 | 283 / 256 |

How long Ultra thinks varies a lot for the same prompt. Across 7 thinking-on samples it reasoned for 63, 94, 101, 113, 126, 1,312 and 3,010 tokens. The slowest took 7.7 s in total.

Thinking controls:

- `reasoning_effort: "none"` also turns thinking off: 0 reasoning tokens on Ultra, Lightning and Super VL. It is the standard OpenAI parameter, which makes it an alternative to `chat_template_kwargs`.
- `reasoning_effort: "low"` and `"high"` do not reliably change the length. On Ultra, "low" gave 3,010, 101 and 1,312 reasoning tokens and "high" gave 126 and 113. On Lightning, "low" gave 1,775. Bound thinking with `max_tokens` and treat empty `content` as a failure.

### 6.1 Worked-solution accuracy (small sample)

Four MCQs from the sample midterm: recursion, stack, preorder traversal and nested loops. `json_schema` strict, with the schema described in the system prompt. One sample per cell.

| Model | Thinking off | Thinking on |
| --- | --- | --- |
| Ultra | 4/4, 1.0 to 2.0 s | 4/4, 1.6 to 2.6 s |
| Super VL | 3/4 (missed preorder) | 4/4, 2.8 to 3.5 s |
| Super 120B | 3/4 (missed preorder) | 4/4, 2.8 to 4.4 s |
| Lightning | **1/4** | 4/4, 4.4 to 8.4 s |

### 6.2 Transcript cleanup and exam hints (one sample each)

Input: `scripts/fixtures/lecture.txt`, lower-cased with punctuation stripped (340 tokens). Thinking off, `json_schema` strict with notes, exam hints and tasks.

| Model | Time | Exam hints found | Math style |
| --- | --- | --- | --- |
| Lightning | 4.9 s | all 3, including "this will be on term test 2" | LaTeX (`$\int u \, dv$`), despite being asked for Unicode |
| Ultra | 2.2 s | both key passages, with "term test 2" merged into the first quote | Unicode (∫ u dv) |
| Super VL | 4.5 s | 2, and missed "this will be on term test 2" | Unicode |

## 7. Rate limits

- Every response carries `x-ratelimit-limit-requests`, `-limit-tokens`, `-remaining-requests`, `-remaining-tokens`, `-reset-requests`, `-reset-tokens` and the `x-ratelimit-dynamic-*` headers. It also carries `x-served-by` with the region host and `x-inference-id`.
- Per-model base limits come from the model metadata and match the headers: 1,000 RPM and 2M TPM for Super VL, Lightning and Ultra. Super 120B has 1,000 RPM and 1M TPM. Nano has 100 RPM and 800k TPM. Embeddings have 10,000 RPM and 600k TPM.
- From the documentation: limits are re-evaluated every 15 minutes. At 80% or more average use, the next window's limit rises by 20%. At 50% or less it falls by a third. The ceiling is 20 times the base. Over the limit returns 429 with `Retry-After`. A request may still be served at low priority with `x-ratelimit-over-limit: yes`.
- Observed: no 429s and no over-limit responses in 166 calls. The OpenAI SDK in `lib/llm.ts` already retries 429 with `Retry-After`.
- `service_tier: "flex"` works. It did not use up rate limit (remaining requests stayed at 1,000), but one Lightning call took 7.6 s against 0.2 s on `default`. It is not suitable for interactive use.
- `GET /v1/batches` returns 200 with an empty list, so an OpenAI-style Batch API exists even though the OpenAPI spec does not list it. The documentation says it has higher limits. Batch pricing and job submission were not tested.

## 8. Not available

- Speech-to-text: `POST /v1/audio/transcriptions` returns 404. An `input_audio` content part returns 422. The catalog has no audio model.
- PDF or document input (section 4).
- Rerank models and NVIDIA embedding models (section 5).
- `-fast` flavors of the Nemotron models.

## 9. Recommended role-to-model table for Cue

The two models leaving on 2026-11-09 are excluded. Prices are list prices without cache discounts. "Schema in prompt" means the JSON shape is described in the system prompt as well as in `response_format`.

| Role | Model | Thinking | `max_tokens` | `temperature` | Output | Why (measured) | Typical cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Document parsing (exam pages, slides, textbook pages) | Super VL | off | 12,000 per chunk | 0.1 | `json_schema`, schema in prompt, at most 3 pages per chunk, never more than 8 | 3 pages in 2.7 s. Thinking on spends 20 s or more on a page. About 2k tokens per page at 1240 px. | about $0.002 in + output per 3-page chunk |
| Calendar and schedule image parsing | Super VL | off | 2,000 | 0 | `json_schema` strict with day enum and `HH:MM` pattern. Code validates times. | 6 of 6 blocks correct in 3.7 s | $0.0008 |
| Study plan generation | Ultra | on | 8,000 | 0.6 | `json_schema` strict, schema in prompt. Code places sessions and rejects overlaps. | Ultra reasons briefly and decodes at about 340 tok/s. Constrained output survives thinking when the schema is in the prompt. | $0.002 to $0.01 |
| Quick chat and "Ask why" | Ultra | off (`enable_thinking: false` or `reasoning_effort: "none"`) | 1,000 | 0.4 | streamed text | First token in 0.5 to 0.7 s, 4/4 on the MCQ set. Lightning with thinking off got 1/4, so it should not explain answers. | about $0.001 |
| Deep chat | Ultra | on | 8,000 | 0.6 | streamed text, show `reasoning_content` as "thinking" | 4/4 on the MCQ set. First answer token after 0.5 to 7.2 s, depending on reasoning length. | $0.001 to $0.01 |
| Worked solutions | Ultra | on | 8,000 | 0.6 | `json_schema` strict, schema in prompt | 4/4 in 1.6 to 2.6 s | about $0.001 |
| Question generation | Ultra | on | 8,000 | 0.8 | `json_schema` strict, schema in prompt. Then solve each new question with Ultra (thinking off) and drop any whose key disagrees. | Answer keys need the most accurate model. The extra solve pass costs about $0.0003 per question. | $0.005 to $0.02 per batch |
| Study guide chapter writing | Ultra | off | 6,000 | 0.5 | streamed Markdown | About 300 to 340 tok/s, so a 2,500-token chapter takes about 8 s. Thinking adds wait without a measured gain for prose. | $0.0075 output plus input at $1/M |
| Transcript cleanup and exam-hint flagging, live per chunk | Lightning | off | 2,000 | 0.2 | `json_schema` strict | Caught all 3 hints in 4.9 s for $0.00012. It writes LaTeX, so render KaTeX or convert. | about $0.02 per lecture hour |
| End-of-lecture notes pass | Ultra | off | 4,000 | 0.3 | `json_schema` strict | 2.2 s with Unicode math and both key hints | $0.002 |
| Embeddings for retrieval | Qwen3-Embedding-8B | n/a | n/a | n/a | `dimensions: 1024`, batches of 32 or more. Prefix queries with `Instruct: ...\nQuery: `; embed documents as plain text. | The only embedding model. Median 2.65 s per 32-text batch. No reranker exists, so rerank top hits with Ultra (thinking off) if needed. | about $0.00001 per batch |

General settings:

- Turn thinking off with `chat_template_kwargs: {enable_thinking: false}`, as `lib/llm.ts` does today. `reasoning_effort: "none"` is a measured alternative.
- With thinking on, set `max_tokens` high (8,000) and treat empty `content` as an error to retry.
- Never send `tool_choice: "none"`. Leave out `tools` instead. Avoid `tool_choice: "required"` on Lightning.
- Read usage from the final stream chunk, where `choices` is empty.
- Rendered pages: PNG or JPEG, 1240 to 1600 px wide, under 10 MiB, at most 8 per request.

## Sources

- Live API: `GET /v1/models?verbose=true`, and the chat, embeddings, rerank and batches endpoints, called on 2026-10-27.
- Catalog pages: https://tokenfactory.nebius.com/models/catalog/text2text/nvidia%2FNemotron-3-Ultra-550b-a55b and the matching pages for Super VL, Lightning, Super 120B, Nano and Qwen3-Embedding-8B.
- Rate limits: https://docs.tokenfactory.nebius.com/ai-models-inference/rate-limits.md
- Structured output: https://docs.tokenfactory.nebius.com/ai-models-inference/json.md
- Function calling: https://docs.tokenfactory.nebius.com/ai-models-inference/function-calling.md
- Cached tokens: https://docs.tokenfactory.nebius.com/cached-tokens.md
- Model flavors: https://docs.tokenfactory.nebius.com/ai-models-inference/overview.md
- Deprecations: https://docs.tokenfactory.nebius.com/model-deprecations-november-2026.md
- OpenAPI: https://api.tokenfactory.nebius.com/openapi.json
