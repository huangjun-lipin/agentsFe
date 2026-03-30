# AgentsFe — CopilotKit + DeepAgents 智能待办助手

基于 CopilotKit + DeepAgents 框架的智能待办事项管理系统，复用 pomeloclaw 高级处理逻辑。

## 架构

```
┌─────────────────┐     ┌──────────────────────┐
│   Frontend      │     │      Backend          │
│  React + Vite   │────▶│  Express + CopilotKit │
│  CopilotKit UI  │     │  DeepAgents Agent     │
│  :5173          │     │  :4000                │
└─────────────────┘     └──────────────────────┘
```

### 从 pomeloclaw 复用的模块

| 模块 | 文件 | 功能 |
|------|------|------|
| 上下文压缩 | `compaction/` | token 估算、自动压缩、LLM 摘要生成 |
| 敏感信息脱敏 | `security/redaction.ts` | 正则脱敏 API Key、Token、密码 |
| Prompt Bootstrap | `prompt/bootstrap.ts` | 多文件上下文注入 + 字符预算截断 |
| 会话运行时 | `conversation/runtime.ts` | 生命周期管理、模型热切换 |
| MCP 集成 | `mcp.ts` | MultiServerMCPClient、环境变量展开 |
| 配置校验 | `config/` | Zod schema 校验 |
| 子智能体 | `subagents/` | SubAgent 接口模式、技能编写子代理 |
| 模型兼容中间件 | `agent.ts` | ModelResponseCompatibilityMiddleware |

## 快速开始

### 1. 安装依赖

```bash
# 后端
cd backend && npm install

# 前端
cd frontend && npm install
```

### 2. 配置环境变量

编辑 `backend/.env`：

```env
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
```

或编辑 `backend/config.json` 进行更详细的配置。

### 3. 启动开发服务

```bash
# 后端（端口 4000）
cd backend && npm run dev:runtime

# 前端（端口 5173，自动代理到后端）
cd frontend && npm run dev
```

### 4. 访问

打开 http://localhost:5173

## 项目结构

```
agentsFe/
├── backend/
│   ├── src/
│   │   ├── agent.ts              # 主智能体工厂 (createTodoAgent)
│   │   ├── runtime.ts            # Express + CopilotRuntime 入口
│   │   ├── llm.ts                # LLM 模型创建（OpenAI/Anthropic）
│   │   ├── mcp.ts                # MCP 工具初始化
│   │   ├── config/               # Zod 配置校验
│   │   ├── compaction/           # 上下文压缩 + LLM 摘要
│   │   ├── security/             # 敏感信息脱敏
│   │   ├── prompt/               # Prompt Bootstrap 注入
│   │   ├── conversation/         # 会话运行时管理
│   │   ├── tools/                # Todo 业务工具
│   │   └── subagents/            # 子智能体
│   ├── workspace/                # 智能体工作区
│   │   ├── AGENTS.md
│   │   ├── TOOLS.md
│   │   ├── SOUL.md
│   │   ├── HEARTBEAT.md
│   │   └── skills/
│   ├── config.json
│   ├── langgraph.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── components/
│   │       ├── TodoList.tsx
│   │       └── TodoList.css
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
└── README.md
```

## 扩展

### 添加 MCP 服务器

编辑 `backend/config.json`：

```json
{
  "mcp": {
    "enabled": true,
    "servers": {
      "my-server": {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "my-mcp-server"]
      }
    }
  }
}
```

### 添加新工具

在 `backend/src/tools/` 下创建新工具文件，然后在 `agent.ts` 中导入并注册。

### 添加新子智能体

在 `backend/src/subagents/index.ts` 中的 `getSubagents()` 函数添加新的子智能体。

### 自定义 Prompt Bootstrap

编辑 `backend/workspace/` 下的 `.md` 文件来自定义智能体的行为、风格和工具使用约定。
