# kids-one-shot

**一句话命令 → 完整儿童益智动画**。AI 动画生产线：剧本策划、分镜、视频生成（可灵/Seedance）、TTS 旁白、自动合成、QC 质检，全流程自动化。

```bash
python3 make_story.py "制作一个龟兔赛跑儿童益智动画，寓意：不要骄傲，坚持更重要" --real
```

输出：竖屏 9:16、60–90 秒成片（`jobs/<时间>_<slug>/output/`），适合 3–6 岁，单集一个知识点/寓意。

## 架构

![架构图](docs/architecture.svg)

## 流水线

| 阶段 | 产物 | 说明 |
|---|---|---|
| ① 策划 | `brief.json` | 题材、受众（3–6 岁）、画幅 1080x1920、目标时长、画风 |
| ② 剧本 | `script.json` | LLM（默认 Kimi，可切豆包/火山方舟）生成并校验 |
| ③ 分镜 | `storyboard.json` / `timeline_v1.json` | 镜头拆分与时间轴 |
| ④ 素材 | `assets/` `clips/` | Seedream 图片、Seedance/可灵视频片段 |
| ⑤ 音频 | `audio/` `subs/` | 豆包 TTS 中文旁白（字幕对齐、儿童语速）；可灵原生音频只做环境声，合成时 ducking 压低 |
| ⑥ 合成 | FFmpeg | 字幕对齐、音画合成 |
| ⑦ QC | `qc_report.json` | 时长、音画、内容安全（无恐怖、无危险模仿） |

每次运行是一个独立目录：`jobs/<时间>_<slug>/`，全部中间产物可追溯、可重跑。

## 使用

```bash
cd kids-one-shot
cp .env.example .env   # 填真实 key；.env 已在 .gitignore，绝不上库

# 干跑（不调外部平台，验证骨架）
python3 make_story.py "龟兔赛跑"

# 真实跑
python3 make_story.py "龟兔赛跑，教孩子不要骄傲，要坚持" --real
```

## 设计要点

- **AI 编排**：文本（Kimi/豆包）→ 视觉（Seedream/Seedance）→ 语音（豆包 TTS）多模型串联，每阶段产物为结构化 JSON，可校验、可回滚
- **音频策略**：中文旁白一律走 TTS，保证字幕对齐与知识点读音稳定；生成视频的原生音频仅作环境声
- **儿童内容安全**：QC 内置年龄段、内容禁忌与时长检查
- **密钥安全**：所有 API key 仅存本地 `.env`（已 gitignore），仓库内只有占位符 `.env.example`

## 路线图

- [x] 单集生产线（命令触发）
- [ ] 批量生成 / 定时任务
- [ ] 自动发布（小红书/视频号）
