import { useState, useEffect, useCallback } from 'react';
import { useCopilotAction } from '@copilotkit/react-core';
import './TodoList.css';

interface TodoItem {
    id: string;
    title: string;
    completed: boolean;
    createdAt: string;
}

export function TodoList() {
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [newTitle, setNewTitle] = useState('');
    const [loading, setLoading] = useState(false);

    const fetchTodos = useCallback(async () => {
        try {
            const res = await fetch('/api/todos');
            if (res.ok) {
                const data = await res.json();
                setTodos(data);
            }
        } catch (error) {
            console.error('Failed to fetch todos:', error);
        }
    }, []);

    useEffect(() => {
        fetchTodos();
        const interval = setInterval(fetchTodos, 3000);
        return () => clearInterval(interval);
    }, [fetchTodos]);

    // 注册 CopilotKit action 用于前端状态同步
    useCopilotAction({
        name: 'refreshTodoList',
        description: '刷新前端待办列表显示',
        handler: async () => {
            await fetchTodos();
            return '已刷新待办列表';
        },
    });

    const handleAddTodo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;

        setLoading(true);
        try {
            const res = await fetch('/api/agent/invoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: `添加待办事项：${newTitle}` }],
                }),
            });
            if (res.ok) {
                setNewTitle('');
                await fetchTodos();
            }
        } catch (error) {
            console.error('Failed to add todo:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (todo: TodoItem) => {
        try {
            const action = todo.completed ? '取消完成' : '完成';
            await fetch('/api/agent/invoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: `${action}待办事项 ID ${todo.id}` }],
                }),
            });
            await fetchTodos();
        } catch (error) {
            console.error('Failed to toggle todo:', error);
        }
    };

    const handleDelete = async (todo: TodoItem) => {
        try {
            await fetch('/api/agent/invoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: `删除待办事项 ID ${todo.id}` }],
                }),
            });
            await fetchTodos();
        } catch (error) {
            console.error('Failed to delete todo:', error);
        }
    };

    const completedCount = todos.filter(t => t.completed).length;
    const totalCount = todos.length;

    return (
        <div className="todo-list">
            <div className="todo-header">
                <h2>📋 待办事项</h2>
                <span className="todo-count">
                    {completedCount}/{totalCount} 已完成
                </span>
            </div>

            <form className="todo-form" onSubmit={handleAddTodo}>
                <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="输入新的待办事项..."
                    disabled={loading}
                />
                <button type="submit" disabled={loading || !newTitle.trim()}>
                    {loading ? '添加中...' : '添加'}
                </button>
            </form>

            <ul className="todo-items">
                {todos.length === 0 ? (
                    <li className="todo-empty">
                        暂无待办事项，在上方输入或通过右侧聊天助手添加
                    </li>
                ) : (
                    todos.map((todo) => (
                        <li key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
                            <button
                                className="todo-toggle"
                                onClick={() => handleToggle(todo)}
                            >
                                {todo.completed ? '✅' : '⬜'}
                            </button>
                            <span className="todo-title">{todo.title}</span>
                            <button
                                className="todo-delete"
                                onClick={() => handleDelete(todo)}
                            >
                                🗑️
                            </button>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
}
