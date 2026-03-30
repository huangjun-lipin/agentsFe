import express from 'express';
import {
  CopilotRuntime,
  LangChainAdapter,
  copilotRuntimeNodeExpressEndpoint,
} from '@copilotkit/runtime';
import { createTodoAgent } from './agent.js';
import { loadConfig } from './config/index.js';
import { createChatModel } from './llm.js';
import { getAllTodos } from './tools/todo-tools.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

async function listenWithPortRetry(
  app: express.Express,
  startPort: number,
  maxAttempts = 10,
) {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = startPort + offset;
    try {
      const server = await new Promise<ReturnType<typeof app.listen>>(
        (resolve, reject) => {
          const candidate = app.listen(port);
          candidate.once('listening', () => resolve(candidate));
          candidate.once('error', (error: NodeJS.ErrnoException) => {
            candidate.close(() => reject(error));
          });
        },
      );

      if (offset > 0) {
        console.warn(
          `[Runtime] Port ${startPort} is in use, fallback to port ${port}`,
        );
      }

      return { server, port };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EADDRINUSE' || offset === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new Error(
    `Unable to bind a port from ${startPort} to ${startPort + maxAttempts - 1}`,
  );
}

async function main() {
  const config = loadConfig();
  const agentContext = await createTodoAgent(config);

  console.log('[Runtime] Agent initialized successfully');

  const app = express();
  app.use(express.json());

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', FRONTEND_URL);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // CopilotKit Runtime endpoint
  const copilotRuntime = new CopilotRuntime();
  const copilotModel = await createChatModel(config, { temperature: 0 });
  const serviceAdapter = new LangChainAdapter({
    chainFn: async ({ messages, tools }) => {
      const boundModel = (copilotModel as { bindTools?: Function }).bindTools;
      if (typeof boundModel === 'function') {
        return (copilotModel as { bindTools: Function })
          .bindTools(tools)
          .stream(messages);
      }
      return (copilotModel as { stream: Function }).stream(messages);
    },
  });
  const handler = copilotRuntimeNodeExpressEndpoint({
    runtime: copilotRuntime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  app.post('/api/copilotkit', async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('[CopilotKit] Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Agent invoke endpoint (直接调用 deepagent)
  app.post('/api/agent/invoke', async (req, res) => {
    try {
      const { messages, threadId } = req.body;
      const result = await agentContext.agent.invoke(
        { messages },
        { configurable: { thread_id: threadId || 'default' } },
      );
      res.json(result);
    } catch (error) {
      console.error('[Agent] Invoke error:', error);
      res.status(500).json({ error: 'Agent invocation failed' });
    }
  });

  // Agent stream endpoint
  app.post('/api/agent/stream', async (req, res) => {
    try {
      const { messages, threadId } = req.body;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = agentContext.agent.streamEvents(
        { messages },
        { configurable: { thread_id: threadId || 'default' }, version: 'v2' },
      );

      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('[Agent] Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Agent stream failed' });
      }
    }
  });

  // Todo 状态 API
  app.get('/api/todos', (_req, res) => {
    res.json(getAllTodos());
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const { server, port: activePort } = await listenWithPortRetry(app, PORT);
  console.log(`[Runtime] Server running on http://localhost:${activePort}`);
  console.log(
    `[Runtime] CopilotKit endpoint: http://localhost:${activePort}/api/copilotkit`,
  );
  console.log(
    `[Runtime] Agent endpoint: http://localhost:${activePort}/api/agent/invoke`,
  );
  console.log(
    `[Runtime] Todos endpoint: http://localhost:${activePort}/api/todos`,
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Runtime] Shutting down...');
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await agentContext.cleanup();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[Runtime] Failed to start:', error);
  process.exit(1);
});
