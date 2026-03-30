# TOOLS.md — 工具使用约定

## Todo 工具
- `add_todo`: 添加待办，需要 title 参数
- `list_todos`: 列出所有待办，无参数
- `complete_todo`: 完成待办，需要 id 参数
- `delete_todo`: 删除待办，需要 id 参数

## 使用原则
- 用户说"添加/新建/创建"时使用 add_todo
- 用户说"列表/查看/显示"时使用 list_todos
- 用户说"完成/done/勾选"时使用 complete_todo
- 用户说"删除/移除"时先确认再使用 delete_todo
- 多个操作按顺序执行，每个给出中间状态

## MCP 扩展
- 如果配置了 MCP 服务器，会注入额外工具
- MCP 工具名称会带服务器前缀，调用时使用完整名称
