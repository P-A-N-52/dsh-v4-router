# AGENTS.md — dsh-v4-router

kimi-code CLI 插件：DeepSeek V4 Flash/Pro 的推理模式路由器。把 [dsh-router-standard](https://github.com/yjh051108/dsh-router-standard) 的实测最优配方（w7 / w6c persona + 每轮近场引导）移植到 kimi-code 的 hook 机制上，并叠加用户指定的 Reasoning Protocol（英文思考、"We need..." 开头）。

## 目录结构

```
kimi.plugin.json        # manifest：hooks（SessionStart + UserPromptSubmit）、skills、commands
hooks/session-start.mjs # 记录 session_id → 配置默认模型（兜底用）
hooks/route.mjs         # 核心：门控 + 配方选择 + 近场注入（stdout → 追加进上下文）
lib/core.mjs            # 固定文本、正则、模型家族判定、wire 检测、状态文件读写
commands/*.md           # /dsh-v4-router:on|off|auto|status（agent 执行型）
skills/router/SKILL.md  # 机制说明
```

## 铁律（改动前必读）

1. **固定文本逐字移植，禁止改写**（`lib/core.mjs` 里的 persona / GUIDE_* / 协议文本）。它们是实测配方，且固定文本 = prefix cache 中性（92-95% 命中）；改动措辞 = 改配方 + 炸缓存。
2. **行为引导只走近场**（UserPromptSubmit hook 的 stdout），严禁挪进 system 侧——同一文本放 system 路由崩到 67%，近场 96%（P20）。
3. **Pro 配方零锚**（P24：锚对 Pro 是负效果），Flash 配方带三锚。不要互相串。
4. **续作抑制不可删**（P21：相关任务链上所有引导都是负效果）。
5. 状态文件：`$KIMI_CODE_HOME/dsh-v4-router.state.json`，三态 `auto/on/off`，写入必须原子（tmp + rename）。

## 实测踩过的坑（kimi-code 0.36.1）

- `UserPromptSubmit` 的 `prompt` 字段是**数组** `[{type:"text",text:...}]`，不是字符串。
- `SessionStart` 上报的 `model` 是**配置默认模型**，不含 `-m` 覆盖或 TUI 会话内选择 → 真实模型要从会话 wire.jsonl 尾部读（`lib/core.mjs` 的 `modelFromWire`）。第一条消息时 wire 未写盘、无任何可靠信号（payload/env/日志/状态文件全部查过，均无），因此**首条只注入家族中性的 Reasoning Protocol，persona 延迟到 wire 证据到位**——给错 persona 是实测最差情况且路径提交会粘住，迟一条不损效果（P14/P19）。
- hook 一律 fail-open：任何异常都必须静默 exit 0，不能阻断主流程。

## 开发 / 测试

```bash
# 单测（不需要 API）：模拟事件喂 stdin，KIMI_CODE_HOME 指向临时目录
export KIMI_CODE_HOME=$(mktemp -d)
echo '{"session_id":"s1","model":"deepseek-v4-flash","source":"startup"}' | node hooks/session-start.mjs
echo '{"session_id":"s1","prompt":[{"type":"text","text":"设计一个缓存系统"}],"is_steer":false}' | node hooks/route.mjs

# 端到端（需要已配置的 deepseek provider）：
kimi -m "deepseek/deepseek-v4-flash" -p "<task1>"            # 首轮建立 wire 记录
kimi -S <session_id> -m "deepseek/deepseek-v4-flash" -p "<task2>"  # 第二轮起注入生效
# 验证：grep 'HIGHEST PRIORITY' <session>/agents/main/wire.jsonl
```

## 安装 / 重装

CLI 只跑托管副本，改完源目录必须同步：

```bash
cp -R ~/dsh-v4-router/. ~/.kimi-code/plugins/managed/dsh-v4-router/
# 然后在 kimi 里 /plugins reload（或 /new）
```

首次安装：`/plugins install ~/dsh-v4-router`。

## 许可

MIT。配方与实验数据来自 dsh-router-standard（MIT），见 skills/router/SKILL.md 的出处说明。
