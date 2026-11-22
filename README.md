---
locale: en
translations:
  zh-CN: README.zh-CN.md
---

# Gemini Omni & Gemini Decision

**English** | [简体中文](README.zh-CN.md)

Serves Google's Gemini Omni Flash video generation and Gemini Decision 1 through new-api with a Google AI Studio key or a compatible video backend: text-to-video and, in the default Interactions mode, image-to-video on the OpenAI video and Responses endpoints, and yes/no, choice and score decisions on the Gemini API's own `POST /v1beta/decisions`. Calls settle on reported token usage when available; video requests keep the reserved tokens when usage is missing.

Requires new-api v1.0.0-rc.50 or later.

## Channel setup

1. Install the plugin, then add a channel of type Task Plugin and bind it to `byaiden_gemini`.
2. Base URL: leave empty for `https://generativelanguage.googleapis.com`; for a compatible video backend, use its root URL without an API path.
3. Key: a Gemini API key from Google AI Studio, or the compatible backend's API key. Gemini Omni needs a project on the paid tier; Gemini Decision also works on the free tier.
4. Models: `gemini-omni-1.2-flash`, `gemini-omni-1.1-flash` and `gemini-decision-1`, as you offer them. A model appears on the pricing pages only after an enabled channel lists it.
5. Video settings (`meta.channelConfig`): `video_api` is `interactions` (default) or `predict_long_running`. `video_api_key_location` is `header` (default, `x-goog-api-key`) or `query` (`?key=`), only for `predict_long_running`. This controls the plugin's upstream API key, not client gateway authentication.
6. To use another New API gateway as the upstream, add a New API channel with that gateway's address and token and bind this plugin; that gateway needs the plugin too. Only Gemini Decision works this way; videos require a Task Plugin channel, not New API chaining.

For a compatible backend requiring query authentication, use a Task Plugin channel with Base URL `https://your-backend.example.com` and these settings:

```json
{
  "video_api": "predict_long_running",
  "video_api_key_location": "query"
}
```

The plugin calls `POST /v1beta/models/{upstreamModel}:predictLongRunning` with `instances: [{prompt}]` and `parameters` (`personGeneration: "dont_allow"`, `sampleCount: 1`, `aspectRatio`, `durationSeconds`, `resolution`), polls the returned `name` until `done: true`, then downloads `response.generateVideoResponse.generatedSamples[0].video.uri`. Default Interactions behavior, image inputs and existing tasks are unchanged.

## Models and endpoints

| Endpoint | What it does | Models |
| --- | --- | --- |
| `POST /v1/videos` | Creates a video from a prompt; `interactions` also accepts up to 6 images. Upload an image as the `input_reference` file in a multipart request, or send it in `input_reference` or `images` in JSON. | `gemini-omni-1.2-flash`, `gemini-omni-1.1-flash` |
| `POST /v1/responses` | Creates a video through the Responses API, as a stream, a blocking call or a background call. | `gemini-omni-1.2-flash`, `gemini-omni-1.1-flash` |
| `POST /v1beta/decisions` | Answers yes/no (`noul`), choice and score questions about text, image, audio, video or PDF input with the Gemini API's own request body, in the same call. | `gemini-decision-1` |

Both video modes use `/v1/videos` or `/v1/responses` with the gateway token in `Authorization: Bearer`; there is no client-facing `predictLongRunning` route. Clients poll `GET /v1/videos/{task_id}` and download the file from `GET /v1/videos/{task_id}/content`. A finished Responses result contains a gateway link to the video; background responses are read with `GET /v1/responses/{response_id}`.

`POST /v1beta/decisions` is also served under `/byaiden_gemini`. It takes the gateway token as `Authorization: Bearer` only; the `x-goog-api-key` header and `?key=` parameter are not accepted.

Video requests take `prompt`, `seconds`, `resolution` (`360p`, `720p`, `1080p` or `4k`) and `size`. A `size` taller than it is wide gives a 9:16 video, other sizes 16:9; without `resolution` it is derived from `size`, otherwise `720p`. In `interactions` mode, one image is the first frame, two are the first and last frame, three to six are subject references.

## Billing

Gemini Omni has three price fields: "Input token unit price", "Text output token unit price" (thinking included) and "Video output token unit price" (video with audio). When the request arrives the gateway reserves the video tokens for the requested duration and resolution: 1,931 per second at 360p, 5,792 at 720p, 8,688 at 1080p and 17,376 at 4k. On completion, reported usage replaces the corresponding reservations; if the upstream returns no usage, the reserved video tokens stand, not Google's actual reported usage. At Google's list prices for `gemini-omni-1.2-flash`:

```
tier("base", u("input_tokens") * 1.5 / 1000000 + u("output_tokens") * 9 / 1000000 + u("video_tokens") * 12 / 1000000)
```

Until December 3, 2026 Google bills `gemini-omni-1.1-flash` video output at USD 17.50 per million tokens; after that it routes the model to 1.2 at 1.2 rates.

Gemini Decision has one price field, "Input token unit price"; Google bills no output tokens. The gateway reserves the request's UTF-8 size plus formatting headroom for text-only input, or 262,144 tokens when the input carries media, and settles on the `usage.total_input_tokens` Google reports. At Google's list price: `tier("base", u("input_tokens") * 0.1 / 1000000)`.

Multiply the prices by your margin. Rejected requests and failed generations are not billed.

## Example

```bash
curl https://your-gateway.example.com/v1/videos \
  -H "Authorization: Bearer $NEWAPI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-omni-1.2-flash", "prompt": "Waves rolling onto a black sand beach at sunset", "seconds": 8, "resolution": "720p"}'
```

With the `predict_long_running` / `query` channel above, request an 8-second, 360p, 16:9 video through the same gateway endpoint (`size` sets the aspect ratio; `resolution` sets the quality):

```bash
curl https://your-gateway.example.com/v1/videos \
  -H "Authorization: Bearer $NEWAPI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-omni-1.2-flash", "prompt": "A drone flying over a forest at sunrise", "seconds": 8, "resolution": "360p", "size": "640x360"}'
```

Poll the task with the `id` from either reply, then download the video:

```bash
curl https://your-gateway.example.com/v1/videos/{task_id} \
  -H "Authorization: Bearer $NEWAPI_TOKEN"

curl -o video.mp4 https://your-gateway.example.com/v1/videos/{task_id}/content \
  -H "Authorization: Bearer $NEWAPI_TOKEN"
```

Gemini Decision:

```bash
curl https://your-gateway.example.com/v1beta/decisions \
  -H "Authorization: Bearer $NEWAPI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-decision-1", "input": "The blue mug I ordered arrived cracked.", "questions": {"is_damaged": {"type": "noul", "instructions": "Did the item arrive damaged?"}}}'
```

```json
{"answers": {"is_damaged": {"type": "noul", "noul": 0.99, "confidence": 0.99}}, "usage": {"total_input_tokens": 100, "input_tokens_by_modality": [{"modality": "text", "tokens": 100}], "total_output_tokens": 0, "total_tokens": 100}}
```

## Limits

- Gemini Omni 1.2 generates 3 to 15 seconds; Gemini Omni 1.1 and first-and-last-frame videos stop at 10 seconds. The default is 8 seconds.
- `predict_long_running` currently supports text-to-video only; image inputs are rejected rather than mapped to an undocumented protocol. In `interactions` mode, input images are JPEG or PNG, as a data URL or base64; an uploaded file is at most 20 MiB. Each request returns one video.
- Editing, extending and multi-turn conversations of the Interactions API are not offered, nor video or audio input for Gemini Omni.
- In `interactions` mode, Google delivers videos inline and keeps finished videos for 55 days on the paid tier by default. This retention does not apply to `predict_long_running` backends. A 15-second 4k video is large; raise `MAX_FILE_DOWNLOAD_MB` on the gateway if downloads of long high-resolution videos fail.
- `predict_long_running` downloads require an absolute HTTPS video URI. The plugin attaches the upstream API key only for same-origin media; cross-origin downloads are credentialless and subject to the host's SSRF restrictions. Cross-origin URIs requiring separate authentication are not supported.
- Gemini Decision takes 1 to 1,000 questions, 2 to 255 choice options or score levels, and 262,144 tokens of input and questions together. Only `model`, `input` and `questions` are accepted.
- Gemini Decision media goes inline as base64 `data` or as a public or signed HTTPS `uri`. Files API URIs are rejected because they name files in the gateway's Google account; `gs://` and YouTube links are not supported by Google.
- Gemini Decision replies are not stored and cannot be queried again.
