import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { TodoList } from './components/TodoList';
import './App.css';

function App() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="default">
      <div className="app-container">
        <header className="app-header">
          <h1>🤖 AgentsFe — 智能待办助手</h1>
          <p className="app-subtitle">
            基于 CopilotKit + DeepAgents 的智能待办管理
          </p>
        </header>
        <main className="app-main">
          <TodoList />
        </main>
      </div>
      <CopilotSidebar
        defaultOpen={true}
        labels={{
          title: 'TodoBot 助手',
          initial:
            '你好！我是 TodoBot，你的智能待办助手。\n\n你可以让我帮你：\n- 添加待办事项\n- 查看待办列表\n- 完成或删除待办\n\n试试说「帮我添加一个待办：学习 CopilotKit」',
          placeholder: '输入你的请求...',
        }}
      />
    </CopilotKit>
  );
}

export default App;
