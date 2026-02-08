# Ollama interface Private Agent

A powerful interface that works with Ollama locally. Features both terminal (CLI) and web UI interfaces for daily productivity tasks.

## Features

✨ **Dual Interface**
- 🖥️ Terminal CLI for command-line users
- 🌐 Beautiful web UI for browser-based interaction

🤖 **Model Management**
- Easy model selection from available Ollama models
- Support for all Ollama-compatible models (Llama2, Mistral, CodeLlama, etc.)

💬 **Smart Conversation**
- Context-aware conversations
- Automatic context reset when token limit reached
- Conversation history management

🔧 **Customization**
- Configurable system prompts
- Adjustable context token limits
- Temperature and top_p settings

💾 **Data Management**
- Export conversation history as JSON
- Import previous conversations
- Clear history when needed

## Prerequisites

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   ```

2. **Ollama** installed and running
   ```bash
   # Install Ollama (if not installed)
   # Visit: https://ollama.ai/download
   
   # Start Ollama server
   ollama serve
   
   # Pull a model (choose one or more)
   ollama pull llama2
   ollama pull mistral
   ollama pull codellama
   ```

## Installation

1. **Clone or download the project**
   ```bash
   cd ollama-interface
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

## Usage

### Terminal Interface (CLI)

Start the terminal interface:
```bash
npm run cli
```

**CLI Features:**
- Interactive menu-driven interface
- Model selection
- Chat mode with streaming responses
- Settings configuration
- History management (view, export, import, clear)

**CLI Navigation:**
- Use arrow keys to select options
- Type `exit` in chat mode to return to main menu
- Ctrl+C to exit the application

### Web Interface

Start the web server:
```bash
npm run web
```

Then open your browser to: `http://localhost:3000`

**Web UI Features:**
- Beautiful, responsive interface
- Real-time streaming responses
- Model selection dropdown
- Settings panel
- One-click history export/clear
- Typing indicators

### Development Mode

For auto-reload during development:
```bash
npm run dev
```

## Configuration

### Default Settings
- **Ollama URL**: `http://localhost:11434`
- **Default Model**: `llama2`
- **Max Context Tokens**: `4096`
- **System Prompt**: "You are a helpful AI assistant."

### Changing Settings

**Terminal CLI:**
1. Select "⚙️ Settings" from main menu
2. Choose what to configure
3. Enter new values

**Web UI:**
1. Click "⚙️ Settings" button in header
2. Modify system prompt or token limit
3. Click "Save"

## Available Commands

```bash
npm start      # Start default interface (CLI)
npm run cli    # Start terminal interface
npm run web    # Start web interface
npm run dev    # Start web interface with auto-reload
```

## Project Structure

```
ollama-interface/
├── src/
│   ├── agent.js        # Core agent class with Ollama integration
│   ├── cli.js          # Terminal interface
│   ├── web-server.js   # Web server and API
│   └── index.js        # Main entry point
├── public/
│   ├── index.html      # Web UI
│   └── app.js          # Frontend JavaScript
├── package.json
└── README.md
```

## API Endpoints (Web Server)

- `POST /api/init` - Initialize agent session
- `GET /api/models` - List available models
- `POST /api/model` - Change model
- `POST /api/chat` - Send message (supports streaming)
- `GET /api/history/:sessionId` - Get conversation history
- `DELETE /api/history/:sessionId` - Clear history
- `GET /api/export/:sessionId` - Export history
- `POST /api/settings/:sessionId` - Update settings

## Context Management

The agent automatically manages conversation context:

1. **Token Tracking**: Estimates token usage based ollama ( prompt_eval_count + eval_count ) 
2. **Auto-Reset**: When context exceeds limit:
   - Keeps system messages
   - Adds a reset notification
   - Preserves last 10 messages
3. **Manual Reset**: Clear history anytime from UI or CLI

## Use Cases

Perfect for daily work tasks:

- 📝 **Writing**: Draft emails, reports, documentation
- 💻 **Coding**: Get code suggestions, debug help, explanations
- 📊 **Analysis**: Analyze data, summarize content
- 🎓 **Learning**: Ask questions, get explanations
- 🤔 **Brainstorming**: Generate ideas, solve problems
- 🔍 **Research**: Quick information lookup and synthesis

## Troubleshooting

### "Cannot connect to Ollama"
- Ensure Ollama is running: `ollama serve`
- Check if Ollama is on port 11434: `curl http://localhost:11434/api/tags`

### "No models found"
- Pull at least one model: `ollama pull llama2`
- List models: `ollama list`

### Port 3000 already in use (Web UI)
- Change port: `PORT=3001 npm run web`
- Or kill process using port 3000

### Slow responses
- Try a smaller model (e.g., `mistral` instead of `llama2:70b`)
- Reduce max context tokens in settings
- Ensure sufficient RAM for the model

## Model Recommendations

For daily work:

- **General Use**: `llama2`, `mistral`
- **Coding**: `codellama`, `deepseek-coder`
- **Fast Responses**: `phi`, `tinyllama`
- **Best Quality**: `mixtral`, `llama2:70b` (requires more RAM)

## Tips for Best Results

1. **Be Specific**: Clear, detailed prompts get better responses
2. **Provide Context**: Include relevant background information
3. **Iterate**: Refine your questions based on responses
4. **Use System Prompts**: Customize behavior for specific tasks
5. **Manage History**: Clear old conversations to improve performance

## Advanced Usage

### Custom System Prompts

Tailor the agent for specific roles:

```
You are a senior software engineer specializing in Python.
Provide concise, production-ready code with best practices.
```

```
You are a technical writer. Explain complex topics clearly
with examples and analogies suitable for beginners.
```

### Import/Export Workflows

1. Export successful conversations
2. Share with team members
3. Import to continue or reference later
4. Build a knowledge base of good prompts

## Contributing

Feel free to enhance this agent:
- Add new features
- Improve UI/UX
- Add more model support
- Enhance context management

## License

ISC License - Use freely for personal or commercial projects!

## Support

Having issues? Check:
1. Ollama is running: `ollama serve`
2. Models are installed: `ollama list`
3. Dependencies installed: `npm install`
4. Node version is correct: `node --version`

---

**Happy AI-assisted working! 🚀**
