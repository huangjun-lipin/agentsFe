import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export interface TodoItem {
    id: string;
    title: string;
    completed: boolean;
    createdAt: string;
}

// 内存中的 Todo 存储（生产环境应替换为持久化存储）
const todoStore = new Map<string, TodoItem>();
let nextId = 1;

export function getTodoTools() {
    const addTodo = tool(
        async ({ title }) => {
            const id = String(nextId++);
            const item: TodoItem = {
                id,
                title,
                completed: false,
                createdAt: new Date().toISOString(),
            };
            todoStore.set(id, item);
            return `✅ 已添加待办事项: [${id}] ${title}`;
        },
        {
            name: 'add_todo',
            description: '添加一个新的待办事项',
            schema: z.object({
                title: z.string().describe('待办事项标题'),
            }),
        },
    );

    const listTodos = tool(
        async () => {
            if (todoStore.size === 0) return '📋 当前没有待办事项';
            const items = Array.from(todoStore.values());
            const lines = items.map(item => {
                const status = item.completed ? '✅' : '⬜';
                return `${status} [${item.id}] ${item.title}`;
            });
            return `📋 待办事项列表:\n${lines.join('\n')}`;
        },
        {
            name: 'list_todos',
            description: '列出所有待办事项',
            schema: z.object({}),
        },
    );

    const completeTodo = tool(
        async ({ id }) => {
            const item = todoStore.get(id);
            if (!item) return `❌ 未找到 ID 为 ${id} 的待办事项`;
            item.completed = true;
            return `✅ 已完成待办事项: [${id}] ${item.title}`;
        },
        {
            name: 'complete_todo',
            description: '将一个待办事项标记为完成',
            schema: z.object({
                id: z.string().describe('待办事项 ID'),
            }),
        },
    );

    const deleteTodo = tool(
        async ({ id }) => {
            const item = todoStore.get(id);
            if (!item) return `❌ 未找到 ID 为 ${id} 的待办事项`;
            todoStore.delete(id);
            return `🗑️ 已删除待办事项: [${id}] ${item.title}`;
        },
        {
            name: 'delete_todo',
            description: '删除一个待办事项',
            schema: z.object({
                id: z.string().describe('待办事项 ID'),
            }),
        },
    );

    return [addTodo, listTodos, completeTodo, deleteTodo];
}

// 暴露 store 供前端状态同步
export function getAllTodos(): TodoItem[] {
    return Array.from(todoStore.values());
}
