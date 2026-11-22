---
locale: zh-CN
---

# Gemini Omni & Gemini Decision

[English](README.md) | **简体中文**

用 Google AI Studio Key 或兼容的视频后端，在 new-api 上提供 Google 的 Gemini Omni Flash 视频生成和 Gemini Decision 1：通过 OpenAI 视频接口和 Responses 接口做文生视频，默认 Interactions 模式还支持图生视频，通过 Gemini API 官方路径 `POST /v1beta/decisions` 做是非题、单选题和评分题判断。有用量时按上游返回的 token 用量结算；无用量的视频任务保留预扣 token。

需要 new-api v1.0.0-rc.50 或更高版本。

## 渠道设置

1. 安装插件后，新建渠道，类型选 Task Plugin，绑定插件 `byaiden_gemini`。
2. Base URL：留空即使用 `https://generativelanguage.googleapis.com`；兼容的视频后端填根地址，不要加接口路径。
3. 密钥：Google AI Studio 创建的 Gemini API Key，或兼容后端的 API Key。Gemini Omni 需要项目开通付费层级；Gemini Decision 免费层级也可以用。
4. 模型：按需填写 `gemini-omni-1.2-flash`、`gemini-omni-1.1-flash` 和 `gemini-decision-1`。模型要被已启用的渠道列出，才会出现在价格页面。
5. 视频设置（`meta.channelConfig`）：`video_api` 可选 `interactions`（默认）或 `predict_long_running`。`video_api_key_location` 可选 `header`（默认，`x-goog-api-key`）或 `query`（`?key=`），仅对 `predict_long_running` 生效。这控制的是插件向上游发送 API Key 的方式，不是客户端的网关鉴权。
6. 如果上游是另一台 New API 网关，新建 New API 渠道，填该网关的地址和令牌并绑定本插件，上游网关也需要安装本插件。这种方式只支持 Gemini Decision；视频必须使用 Task Plugin 渠道，不走 New API 级联。

兼容后端要求 query 鉴权时，使用 Task Plugin 渠道，Base URL 填 `https://your-backend.example.com`，渠道配置如下：

```json
{
  "video_api": "predict_long_running",
  "video_api_key_location": "query"
}
```

插件向上游调用 `POST /v1beta/models/{upstreamModel}:predictLongRunning`，请求包含 `instances: [{prompt}]` 和 `parameters`（`personGeneration: "dont_allow"`、`sampleCount: 1`、`aspectRatio`、`durationSeconds`、`resolution`），按返回的 `name` 轮询至 `done: true`，再直接下载 `response.generateVideoResponse.generatedSamples[0].video.uri`。默认 Interactions 模式、图片输入和旧任务均保持不变。

## 模型与接口

| 接口 | 用途 | 模型 |
| --- | --- | --- |
| `POST /v1/videos` | 根据提示词生成视频；`interactions` 模式还支持最多 6 张图片。图片可在 multipart 请求里作为 `input_reference` 文件上传，或在 JSON 的 `input_reference` 或 `images` 里传。 | `gemini-omni-1.2-flash`、`gemini-omni-1.1-flash` |
| `POST /v1/responses` | 通过 Responses API 生成视频，支持流式、同步等待和后台三种调用方式。 | `gemini-omni-1.2-flash`、`gemini-omni-1.1-flash` |
| `POST /v1beta/decisions` | 用 Gemini API 原生请求体，对文本、图片、音频、视频或 PDF 输入回答是非题（`noul`）、单选题（`choice`）和评分题（`score`），同一次调用返回结果。 | `gemini-decision-1` |

两种视频模式的客户端都走 `/v1/videos` 或 `/v1/responses`，在 `Authorization: Bearer` 中传网关令牌，不新增客户端 `predictLongRunning` 原生路由。轮询 `GET /v1/videos/{task_id}` 查看状态，完成后从 `GET /v1/videos/{task_id}/content` 下载视频。Responses 的结果里带有网关提供的视频链接；后台调用的结果用 `GET /v1/responses/{response_id}` 查询。

`POST /v1beta/decisions` 也可以加 `/byaiden_gemini` 前缀访问。网关令牌只能放在 `Authorization: Bearer` 里，不支持 `x-goog-api-key` 请求头和 `?key=` 参数。

视频请求支持 `prompt`、`seconds`、`resolution`（`360p`、`720p`、`1080p` 或 `4k`）和 `size`。`size` 高大于宽时生成 9:16 的视频，其他尺寸生成 16:9；没有 `resolution` 时按 `size` 换算，都没有时按 `720p`。在 `interactions` 模式下，一张图作为首帧，两张图作为首帧和尾帧，三到六张图作为主体参考图。

## 计费

Gemini Omni 有三个价格字段：“输入 token 单价”、“文本输出 token 单价”（含思考 token）和“视频输出 token 单价”（含音频的视频）。请求到达时，网关按请求的时长和分辨率预扣视频 token：360p 每秒 1,931 个，720p 每秒 5,792 个，1080p 每秒 8,688 个，4k 每秒 17,376 个。完成后按上游返回的用量结算对应项；没有 usage 时保留预扣的视频 token，这不是 Google 实际上报的用量。按 Google 对 `gemini-omni-1.2-flash` 的官方价：

```
tier("base", u("input_tokens") * 1.5 / 1000000 + u("output_tokens") * 9 / 1000000 + u("video_tokens") * 12 / 1000000)
```

2026 年 12 月 3 日之前，Google 对 `gemini-omni-1.1-flash` 的视频输出按每百万 token 17.50 美元收费；之后该模型自动转到 1.2，按 1.2 的价格计费。

Gemini Decision 只有一个价格字段“输入 token 单价”，Google 不收输出 token。纯文本输入按请求的 UTF-8 字节数加格式余量预扣，带媒体的输入按 262,144 token 预扣，完成后按 Google 返回的 `usage.total_input_tokens` 结算。按官方价：`tier("base", u("input_tokens") * 0.1 / 1000000)`。

把价格乘以你的加价倍数即可。被拒绝的请求和生成失败的任务不计费。

## 示例

```bash
curl https://your-gateway.example.com/v1/videos \
  -H "Authorization: Bearer $NEWAPI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-omni-1.2-flash", "prompt": "Waves rolling onto a black sand beach at sunset", "seconds": 8, "resolution": "720p"}'
```

使用上面的 `predict_long_running` / `query` 渠道，通过同一网关接口请求 8 秒、360p、16:9 视频（`size` 决定宽高比，`resolution` 决定画质）：

```bash
curl https://your-gateway.example.com/v1/videos \
  -H "Authorization: Bearer $NEWAPI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-omni-1.2-flash", "prompt": "A drone flying over a forest at sunrise", "seconds": 8, "resolution": "360p", "size": "640x360"}'
```

两种请求都用返回的 `id` 轮询任务，完成后下载视频：

```bash
curl https://your-gateway.example.com/v1/videos/{task_id} \
  -H "Authorization: Bearer $NEWAPI_TOKEN"

curl -o video.mp4 https://your-gateway.example.com/v1/videos/{task_id}/content \
  -H "Authorization: Bearer $NEWAPI_TOKEN"
```

Gemini Decision：

```bash
curl https://your-gateway.example.com/v1beta/decisions \
  -H "Authorization: Bearer $NEWAPI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-decision-1", "input": "The blue mug I ordered arrived cracked.", "questions": {"is_damaged": {"type": "noul", "instructions": "Did the item arrive damaged?"}}}'
```

```json
{"answers": {"is_damaged": {"type": "noul", "noul": 0.99, "confidence": 0.99}}, "usage": {"total_input_tokens": 100, "input_tokens_by_modality": [{"modality": "text", "tokens": 100}], "total_output_tokens": 0, "total_tokens": 100}}
```

## 限制

- Gemini Omni 1.2 生成 3 到 15 秒；Gemini Omni 1.1 和首尾帧视频最长 10 秒。默认 8 秒。
- `predict_long_running` 目前仅支持文生视频，图片输入会被拒绝，不猜测未明确的图片协议。`interactions` 模式的输入图片为 JPEG 或 PNG，格式为 data URL 或 base64；上传的文件不超过 20 MiB。每次请求生成一个视频。
- 不提供 Interactions API 的视频编辑、续写和多轮对话，Gemini Omni 也不接受视频或音频输入。
- `interactions` 模式下 Google 以内联方式返回视频，付费层级默认保存 55 天；该保存期限不适用于 `predict_long_running` 后端。15 秒 4k 视频体积较大，长视频高分辨率下载失败时请调大网关的 `MAX_FILE_DOWNLOAD_MB`。
- `predict_long_running` 的视频 URI 必须是绝对 HTTPS 地址。插件只向同源媒体附带上游 API Key；跨源下载走 credentialless，不附带凭据，并受宿主 SSRF 限制。不支持需要独立鉴权的跨源 URI。
- Gemini Decision 每次 1 到 1000 个问题，单选项或评分等级 2 到 255 个，输入和问题合计不超过 262,144 token。请求只接受 `model`、`input` 和 `questions`。
- Gemini Decision 的媒体用 base64 `data` 内联，或用公开/签名的 HTTPS `uri`。Files API URI 指向网关自己 Google 账号里的文件，会被拒绝；`gs://` 和 YouTube 链接 Google 本身不支持。
- Gemini Decision 的结果不保存，之后无法再次查询。
