import express from 'express';
import { PrivateAgent } from './agent.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Store agent instances per session (simple in-memory storage)
const agents = new Map();

// Safe JSON stringify that handles circular references
function safeStringify(obj, indent = 0) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  }, indent);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize agent for session
app.post('/api/init', async (req, res) => {
  try {
    const sessionId = req.body.sessionId || Date.now().toString();
    const agent = new PrivateAgent({
      ollamaUrl: 'http://localhost:11434',
      model: req.body.model || 'llama2',
      maxContextTokens: req.body.maxContextTokens || 4096
    });

    const isConnected = await agent.checkConnection();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'Cannot connect to Ollama. Is it running?' 
      });
    }

    agents.set(sessionId, agent);
    res.json({ sessionId, connected: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List available models
app.get('/api/models', async (req, res) => {
  try {
    const agent = new PrivateAgent();
    const models = await agent.listModels();
    res.json({ models });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set model
app.post('/api/model', (req, res) => {
  try {
    const { sessionId, model } = req.body;
    const agent = agents.get(sessionId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Session not found' });
    }

    agent.setModel(model);
    res.json({ success: true, model });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message, stream } = req.body;
    console.log('Chat request:', { sessionId, message: message.substring(0, 50), stream });
    
    const agent = agents.get(sessionId);

    if (!agent) {
      console.error('Session not found:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullMessage = '';
      
      try {
        const { total_tokens } = await agent.streamChat(message, (chunk, metadata) => {
          // Ensure chunk is always a string
          const chunkText = typeof chunk === 'string' ? chunk : String(chunk);
          fullMessage += chunkText;
          
          try {
            const data = JSON.stringify({ chunk: chunkText });
            console.log('Sending chunk:', data.substring(0, 50));
            res.write(`data: ${data}\n\n`);
          } catch (jsonError) {
            console.error('JSON stringify error:', jsonError.message);
            console.error('Chunk type:', typeof chunk);
            console.error('Chunk value:', chunk);
            // Send error notification
            res.write(`data: ${JSON.stringify({ error: 'Serialization error' })}\n\n`);
          }
        });
        
        res.write(`data: ${JSON.stringify({ done: true, fullMessage, total_tokens })}\n\n`);
        console.log('Stream complete, total length:', fullMessage.length);
        res.end();
      } catch (streamError) {
        console.error('Stream error:', streamError);
        console.error('Stream error stack:', streamError.stack);
        try {
          res.write(`data: ${JSON.stringify({ error: streamError.message })}\n\n`);
        } catch (e) {
          console.error('Error sending error message:', e);
          res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
        }
        res.end();
      }
    } else {
      const response = await agent.chat(message);
      res.json(response);
    }
  } catch (error) {
    console.error('Chat endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get conversation history
app.get('/api/history/:sessionId', (req, res) => {
  try {
    const agent = agents.get(req.params.sessionId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ history: agent.getHistory() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear history
app.delete('/api/history/:sessionId', (req, res) => {
  try {
    const agent = agents.get(req.params.sessionId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Session not found' });
    }

    agent.clearHistory();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export history
app.get('/api/export/:sessionId', (req, res) => {
  try {
    const agent = agents.get(req.params.sessionId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const exported = agent.exportHistory();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ollama-interface-history-${Date.now()}.json"`);
    res.send(exported);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
app.post('/api/settings/:sessionId', (req, res) => {
  try {
    const agent = agents.get(req.params.sessionId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { systemPrompt, maxContextTokens, enableTools } = req.body;
    
    if (systemPrompt) {
      agent.setSystemPrompt(systemPrompt);
    }
    
    if (maxContextTokens) {
      agent.maxContextTokens = maxContextTokens;
    }

    if (typeof enableTools === 'boolean') {
      agent.setToolsEnabled(enableTools);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get tool call history
app.get('/api/tools/history/:sessionId', (req, res) => {
  try {
    const agent = agents.get(req.params.sessionId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const history = agent.getToolCallHistory();
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute a tool directly
app.post('/api/tools/execute/:sessionId', async (req, res) => {
  try {
    const agent = agents.get(req.params.sessionId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { functionName, args } = req.body;
    const result = await agent.executeTool(functionName, args);
    
    res.json({ result, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// Get system info
app.get('/api/system/info', async (req, res) => {
  try {
    const { SystemTools } = await import('./system-tools.js');
    const tools = new SystemTools();
    const info = await tools.getSystemInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   Private Agent - Web Mode             ║`);
  console.log(`╚════════════════════════════════════════╝`);
  console.log(`\n🌐 Server running at: http://localhost:${PORT}`);
  console.log(`📝 Open this URL in your browser to start\n`);
});
