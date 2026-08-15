# dsh-v4-router

Kimi Code CLI 插件：DeepSeek V4 Flash/Pro 的推理模式路由器。

把 [dsh-router-standard](https://github.com/yjh051108/dsh-router-standard) 30 轮实验实测出的最优配方移植到 kimi-code 的 hook 机制：**按模型自动选择 persona（Flash → w7 带三锚 / Pro → w6c 零锚），每条用户消息后在近场注入固定引导文本**，并叠加 Reasoning Protocol（英文思考、"We need..." 开头，回答保持用户语言）。

实测效果来源（上游数据）：P23 Flash 96% 路由 + 100% 单任务完成；P24 Pro 24/24 路由；P28 Pro 20 轮 98%。

## 安装（kimi-code 内）

在 kimi-code 会话里直接输入：

```
/plugins install https://github.com/P-A-N-52/dsh-v4-router
```

然后 `/plugins reload` 或 `/new` 开新会话即生效。

也可以用本地路径安装（适合自己改过源码）：

```
/plugins install /path/to/dsh-v4-router
```

卸载：`/plugins remove dsh-v4-router`；临时关闭：`/plugins disable dsh-v4-router`。

## 使用方式：不用触发，全自动

插件是 hook 型的，装好后无需任何手动操作：

1. 会话开始时自动记录模型；
2. 你每发一条消息，插件自动判断：
   - **DeepSeek V4 Flash**（模型名含 `deepseek`/`v4` + `flash`/`v4f`）→ 注入 w7 配方；
   - **DeepSeek V4 Pro**（含 `pro`/`v4p`）→ 注入 w6c 配方；
   - **其他模型**（如 kimi-k3、gemini-*-flash）→ 完全静默，零影响；
3. 本会话第一条消息注入完整协议块（Reasoning Protocol + persona），之后每条消息注入一条固定引导（按任务复杂度二选一，缓存友好）；
4. "继续" 这类续作消息自动跳过（实测：相关任务链上引导是负效果，P21）。

**验证它在工作**：用 v4 模型发条任务，看思考是否以英文 `We need...` 开头、回答是否仍是中文。

## 控制命令

| 命令 | 作用 |
|---|---|
| `/dsh-v4-router:status` | 查看当前模式、本会话模型、命中的配方 |
| `/dsh-v4-router:auto` | （默认）只对 DeepSeek V4 Flash/Pro 启用 |
| `/dsh-v4-router:on` | 强制对所有模型启用（拿其他模型做实验用） |
| `/dsh-v4-router:off` | 全部关闭 |

也可以直接编辑状态文件 `~/.kimi-code/dsh-v4-router.state.json`。

## 原理一句话

- **双吸引子实测结论**：同一模型在不同 prompt 条件下表现差 ~10 分；Flash 的最优条件是 w7（neutral + 显式分类 + 回顾/反跑题锚），Pro 是 w6c（spec 句 + 分类、零锚），两者不能互换。
- **位置敏感铁律**：行为引导放在用户消息之后（近场）才有效；放 system 里会衰减（同文本 67% vs 96%，P20）。本插件全部走近场 hook 注入。
- **每轮重新分类**对抗路径提交；注入文本固定，prefix cache 命中 92-95%。

## 仓库结构

```
kimi.plugin.json        # 插件 manifest（hooks / skills / commands 声明）
hooks/session-start.mjs # 会话开始：记录模型
hooks/route.mjs         # 每条用户消息：门控 + 配方选择 + 近场注入
lib/core.mjs            # 固定文本（逐字移植）、模型判定、状态文件
commands/               # /dsh-v4-router:on|off|auto|status
skills/router/SKILL.md  # 机制说明
AGENTS.md               # 开发约定（改文本前先读）
```

## 已知限制

- 用 `-m` 临时指定模型的会话，第一条消息时模型尚未可从 wire 确认，注入从第二条消息开始（协议块顺延，不丢）。
- Reasoning Protocol 的强制全量开启是用户指定的实验项，超出上游实测的任务条件式用法；不适可 `/dsh-v4-router:off`。

## License

MIT。配方与实验数据来自 [yjh051108/dsh-router-standard](https://github.com/yjh051108/dsh-router-standard)（MIT）。
