# AGENTS.md — 项目协作规范

## 项目概述
这是一个基于 CopilotKit + DeepAgents 的智能待办事项助手。

## 协作规范
- 所有待办操作必须通过 todo 工具完成
- 不要在没有用户确认的情况下删除待办事项
- 操作完成后给出明确的状态反馈
- 批量操作时逐个确认

## 项目结构
- backend/: 后端服务（DeepAgents + Express + CopilotRuntime）
- frontend/: 前端应用（React + CopilotKit UI）
- workspace/: 智能体工作区
