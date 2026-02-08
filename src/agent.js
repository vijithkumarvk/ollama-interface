import axios from 'axios';
import { SystemTools } from './system-tools.js';

export class PrivateAgent {
  constructor(config = {
    source: 'web',
    consoleLog: true
  }) {
    this.ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
    this.model = config.model || 'llama2';
    this.maxContextTokens = config.maxContextTokens || 4096;
    this.conversationHistory = [];
    this.systemPrompt = config.systemPrompt || 'You are a helpful AI assistant.';
    this.enableTools = config.enableTools !== false; // Enabled by default
    this.systemTools = new SystemTools();
    this.toolCallHistory = [];
    this.logs = config?.source == 'web' && config?.consoleLog;
  }

  async listModels() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`);
      return response.data.models || [];
    } catch (error) {
      throw new Error(`Failed to fetch models: ${error.message}`);
    }
  }

  async checkConnection() {
    try {
      await axios.get(`${this.ollamaUrl}/api/tags`);
      return true;
    } catch (error) {
      return false;
    }
  }

  setModel(model) {
    this.model = model;
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }

  addMessage(role, content) {
    this.conversationHistory.push({ role, content });
    this.checkAndResetContext();
  }

  checkAndResetContext() {
    // Estimate token count (rough approximation: 1 token ≈ 4 characters)
    const totalChars = this.conversationHistory.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    );
    const estimatedTokens = totalChars / 4;

    if (estimatedTokens > this.maxContextTokens) {
      // Keep system prompt and last few messages
      const systemMessages = this.conversationHistory.filter(
        msg => msg.role === 'system'
      );
      const recentMessages = this.conversationHistory.slice(-10);
      
      this.conversationHistory = [
        ...systemMessages,
        {
          role: 'system',
          content: '[Previous conversation context was reset due to length limit]'
        },
        ...recentMessages
      ];
      
      return true; // Context was reset
    }
    return false; // No reset needed
  }

  /**
   * Get tool definitions for Ollama
   */
  getToolDefinitions() {
    if (!this.enableTools) return [];

    return [
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description: 'Execute a shell command on the system (bash for Linux/Mac, PowerShell for Windows). Use this to run system commands, install packages, check files, etc.',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The command to execute'
              },
              cwd: {
                type: 'string',
                description: 'Working directory for the command (optional)'
              }
            },
            required: ['command']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'List files and directories in a given path',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Directory path to list (. for current directory)'
              },
              detailed: {
                type: 'boolean',
                description: 'Include detailed file information (size, permissions, etc.)'
              }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the contents of a text file',
          parameters: {
            type: 'object',
            properties: {
              filepath: {
                type: 'string',
                description: 'Path to the file to read'
              }
            },
            required: ['filepath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Write content to a file',
          parameters: {
            type: 'object',
            properties: {
              filepath: {
                type: 'string',
                description: 'Path to the file to write'
              },
              content: {
                type: 'string',
                description: 'Content to write to the file'
              },
              append: {
                type: 'boolean',
                description: 'Append to file instead of overwriting'
              }
            },
            required: ['filepath', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_system_info',
          description: 'Get information about the system (OS, CPU, memory, etc.)',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_current_directory',
          description: 'Get the current working directory',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }
    ];
  }

  /**
   * Execute a tool based on function call
   */
  async executeTool(functionName, args) {
    const startTime = Date.now();
    
    try {
      let result;
      
      switch (functionName) {
        case 'execute_command':
          result = await this.systemTools.executeCommand(args.command, {
            cwd: args.cwd
          });
          break;
          
        case 'list_directory':
          result = await this.systemTools.listDirectory(args.path, {
            detailed: args.detailed
          });
          break;
          
        case 'read_file':
          result = await this.systemTools.readFile(args.filepath);
          break;
          
        case 'write_file':
          result = await this.systemTools.writeFile(args.filepath, args.content, {
            append: args.append
          });
          break;
          
        case 'get_system_info':
          result = await this.systemTools.getSystemInfo();
          break;
          
        case 'get_current_directory':
          result = this.systemTools.getCurrentDirectory();
          break;
          
        default:
          throw new Error(`Unknown tool: ${functionName}`);
      }

      const executionTime = Date.now() - startTime;
      
      const toolCall = {
        function: functionName,
        args,
        result,
        executionTime,
        timestamp: new Date().toISOString(),
        success: true
      };

      this.toolCallHistory.push(toolCall);
      
      return result;
    } catch (error) {
      const toolCall = {
        function: functionName,
        args,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        success: false
      };

      this.toolCallHistory.push(toolCall);
      
      throw error;
    }
  }

  /**
   * Enhanced system prompt with tool awareness
   */
  getEnhancedSystemPrompt() {
    if (!this.enableTools) return this.systemPrompt;

    const platform = this.systemTools.platform;
    const shell = this.systemTools.shell;
    
    return `${this.systemPrompt}

You have access to system tools that allow you to interact with the ${platform} system using ${shell}.

Available tools:
1. execute_command(command, cwd?) - Run all shell commands
2. list_directory(path, detailed?) - List files in a directory
3. read_file(filepath) - Read file contents
4. write_file(filepath, content, append?) - Write to files
5. get_system_info() - Get system information
6. get_current_directory() - Get current working directory

To use a tool, respond with a special format:
<tool_call>
<function>tool_name</function>
<arguments>{"arg1": "value1", "arg2": "value2"}</arguments>
</tool_call>

After I execute the tool and show you the results, you can provide a natural language response to the user.

Example:
User: "What files are in my current directory?"
You: <tool_call>
<function>list_directory</function>
<arguments>{"path": ".", "detailed": true}</arguments>
</tool_call>

[I will execute the tool and show results]

You: "Here are the files in your current directory: [explain results]"

IMPORTANT: Only use tools when the user explicitly asks for system interaction. Always explain what you're doing.`;
  }

  async chat(userMessage, options = {}) {
    this.addMessage('user', userMessage);

    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory
    ];

    try {
      const response = await axios.post(
        `${this.ollamaUrl}/api/chat`,
        {
          model: this.model,
          messages: messages,
          stream: options.stream || false,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9,
          }
        },
        {
          responseType: options.stream ? 'stream' : 'json'
        }
      );

      if (options.stream) {
        return response.data; // Return stream
      } else {
        const assistantMessage = response.data.message.content;
        this.addMessage('assistant', assistantMessage);
        return {
          message: assistantMessage,
          model: this.model,
          contextReset: false
        };
      }
    } catch (error) {
      throw new Error(`Chat error: ${error.message}`);
    }
  }

  async streamChat(userMessage, onChunk, options = {}) {
    this.addMessage('user', userMessage);

    // Use simple system prompt if tools are disabled to avoid any issues
    const systemPromptToUse = this.enableTools ? this.getEnhancedSystemPrompt() : this.systemPrompt;
    
    const messages = [
      { role: 'system', content: systemPromptToUse },
      ...this.conversationHistory
    ];

    // Don't use Ollama's tool calling API - use prompt-based approach instead
    const requestBody = {
      model: this.model,
      messages: messages,
      stream: true,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
      }
    };

    if(this.logs){
      console.log('Sending request to Ollama:');
      console.log('  Model:', this.model);
      console.log('  Messages count:', messages.length);
      console.log('  System prompt length:', messages[0].content.length);
      console.log('  Tools enabled:', this.enableTools);
    }

    try {
      const response = await axios.post(
        `${this.ollamaUrl}/api/chat`,
        requestBody,
        {
          responseType: 'stream'
        }
      );

      let fullResponse = '';
      
      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              
              // Handle regular content
              if (parsed.message && parsed.message.content) {
                fullResponse += parsed.message.content;
                onChunk(parsed.message.content);
              }
              
              if (parsed.done) {
                // Check if response contains tool calls
                const toolCalls = this.extractToolCalls(fullResponse);
                
                if (toolCalls.length > 0 && this.enableTools && options.executeTools !== false) {
                  // Execute tools and get results
                  this.executeToolCallsAndContinue(toolCalls, onChunk, options)
                    .then(async (toolResults) => {
                      // Add the response with tool call to history
                      this.addMessage('assistant', fullResponse);
                      
                      // Continue conversation with tool results
                      const followUpPrompt = this.buildToolResultPrompt(toolResults);
                      
                      // Get AI's interpretation of results
                      await this.continueAfterTools(followUpPrompt, onChunk, options);
                      
                      resolve({
                        message: fullResponse,
                        model: this.model,
                        contextReset: false,
                        toolCalls,
                        total_tokens: (parsed?.prompt_eval_count || 0) + (parsed?.eval_count || 0)
                      });
                    })
                    .catch(reject);
                } else {
                  this.addMessage('assistant', fullResponse);
                  resolve({
                    message: fullResponse,
                    model: this.model,
                    contextReset: false,
                    toolCalls: [],
                    total_tokens: (parsed?.prompt_eval_count || 0) + (parsed?.eval_count || 0)
                  });
                }
              }
            } catch (e) {
              // Skip invalid JSON lines
              console.error('Parse error in stream:', e);
            }
          }
        });

        response.data.on('error', (error) => {
          reject(new Error(`Stream error: ${error.message}`));
        });
      });
    } catch (error) {
      console.error('Ollama API Error Details:');
      console.error('  Status:', error.response?.status);
      console.error('  Status Text:', error.response?.statusText);
      console.error('  Message:', error.message);
      
      // Safely log response data without circular references
      if (error.response?.data) {
        try {
          if (typeof error.response.data === 'string') {
            console.error('  Data:', error.response.data);
          } else {
            console.error('  Data:', JSON.stringify(error.response.data, null, 2));
          }
        } catch (e) {
          console.error('  Data: [Could not stringify - circular reference]');
        }
      }
      
      throw new Error(`Stream chat error: ${error.message}`);
    }
  }

  /**
   * Extract tool calls from response text
   */
  extractToolCalls(text) {
    if(this.logs){
      console.log('=== EXTRACT TOOL CALLS ===');
      console.log('Text length:', text.length);
      console.log('Text preview:', text.substring(0, 300));
    }
    
    const toolCalls = [];
    const regex = /<tool_call>\s*<function>(.*?)<\/function>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_call>/gs;
    
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const functionName = match[1].trim();
        const argsText = match[2].trim();
        
        if(this.logs){
          console.log('Found tool call:');
          console.log('  Function:', functionName);
          console.log('  Args text:', argsText);
        }
        
        let args = {};
        if (argsText) {
          try {
            args = JSON.parse(argsText);
            console.log('  Parsed args:', args);
          } catch (e) {
            console.error('  Failed to parse arguments:', argsText);
            console.error('  Error:', e.message);
          }
        }
        
        const toolCall = {
          function: {
            name: functionName,
            arguments: args  // Already a parsed object
          }
        };
        
        console.log('  Tool call object:', JSON.stringify(toolCall));
        toolCalls.push(toolCall);
      } catch (e) {
        console.error('Failed to extract tool call:', e);
      }
    }
    
    if(this.logs){
      console.log('Total tool calls found:', toolCalls.length);
      console.log('=== END EXTRACT ===');
    }
    return toolCalls;
  }

  /**
   * Build prompt with tool results
   */
  buildToolResultPrompt(toolResults) {
    let prompt = 'Tool execution results:\n\n';
    
    for (const result of toolResults) {
      prompt += `Tool: ${result.tool}\n`;
      if (result.error) {
        prompt += `Error: ${result.error}\n\n`;
      } else {
        prompt += `Result:\n${result.result}\n\n`;
      }
    }
    
    prompt += 'Please provide a natural language response to the user based on these results.';
    
    return prompt;
  }

  /**
   * Continue conversation after tool execution
   */
  async continueAfterTools(prompt, onChunk, options) {
    this.addMessage('user', prompt);
    
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory
    ];

    try {
      const response = await axios.post(
        `${this.ollamaUrl}/api/chat`,
        {
          model: this.model,
          messages: messages,
          stream: true,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9,
          }
        },
        {
          responseType: 'stream'
        }
      );

      let fullResponse = '';
      
      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              
              if (parsed.message && parsed.message.content) {
                fullResponse += parsed.message.content;
                onChunk(parsed.message.content);
              }
              
              if (parsed.done) {
                this.addMessage('assistant', fullResponse);
                resolve(fullResponse);
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        });

        response.data.on('error', (error) => {
          reject(new Error(`Stream error: ${error.message}`));
        });
      });
    } catch (error) {
      throw new Error(`Continue chat error: ${error.message}`);
    }
  }

  /**
   * Execute tool calls and continue conversation
   */
  async executeToolCallsAndContinue(toolCalls, onChunk, options) {
    console.log('executeToolCallsAndContinue called with:', JSON.stringify(toolCalls, null, 2));
    onChunk('\n\n🔧 Executing tools...\n\n');
    
    const results = [];
    
    for (const toolCall of toolCalls) {
      console.log('Processing tool call:', toolCall);
      
      const functionName = toolCall.function.name;
      if(this.logs){
        console.log('Function name:', functionName);
        console.log('Raw arguments:', toolCall.function.arguments);
        console.log('Arguments type:', typeof toolCall.function.arguments);
      }
      
      // Handle arguments - they might be string or object
      let args = {};
      
      try {
        const rawArgs = toolCall.function.arguments;
        
        if (rawArgs === null || rawArgs === undefined) {
          args = {};
        } else if (typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
          // Already an object, use as-is
          args = rawArgs;
        } else if (typeof rawArgs === 'string') {
          // It's a string, try to parse it
          if (rawArgs.trim() === '' || rawArgs.trim() === '{}') {
            args = {};
          } else {
            args = JSON.parse(rawArgs);
          }
        } else {
          console.error('Unexpected argument type:', typeof rawArgs, rawArgs);
          args = {};
        }
        
        console.log('Parsed args:', args);
      } catch (error) {
        console.error('Failed to parse tool arguments:', error);
        console.error('Raw value:', toolCall.function.arguments);
        args = {};
      }
      
      onChunk(`\n**Tool:** ${functionName}\n`);
      onChunk(`**Arguments:** \`${JSON.stringify(args)}\`\n\n`);
      
      try {
        const result = await this.executeTool(functionName, args);
        
        // Format result for display
        let resultText = '';
        if (typeof result === 'string') {
          resultText = result;
        } else if (result.stdout !== undefined) {
          resultText = result.stdout + (result.stderr ? '\nStderr: ' + result.stderr : '');
        } else {
          resultText = JSON.stringify(result, null, 2);
        }
        
        onChunk(`**Result:**\n\`\`\`\n${resultText.substring(0, 500)}${resultText.length > 500 ? '...' : ''}\n\`\`\`\n\n`);
        
        results.push({
          tool: functionName,
          result: resultText
        });
      } catch (error) {
        console.error('Tool execution error:', error);
        onChunk(`**Error:** ${error.message}\n\n`);
        
        results.push({
          tool: functionName,
          error: error.message
        });
      }
    }
    
    return results;
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getHistory() {
    return this.conversationHistory;
  }

  exportHistory() {
    return JSON.stringify({
      model: this.model,
      systemPrompt: this.systemPrompt,
      history: this.conversationHistory,
      timestamp: new Date().toISOString()
    }, null, 2);
  }

  importHistory(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      this.model = data.model || this.model;
      this.systemPrompt = data.systemPrompt || this.systemPrompt;
      this.conversationHistory = data.history || [];
      return true;
    } catch (error) {
      throw new Error(`Failed to import history: ${error.message}`);
    }
  }

  /**
   * Enable or disable tools
   */
  setToolsEnabled(enabled) {
    this.enableTools = enabled;
  }

  /**
   * Get tool call history
   */
  getToolCallHistory(limit = 10) {
    return this.toolCallHistory.slice(-limit);
  }

  /**
   * Clear tool call history
   */
  clearToolCallHistory() {
    this.toolCallHistory = [];
  }

  /**
   * Get system tools instance (for direct access if needed)
   */
  getSystemTools() {
    return this.systemTools;
  }
}
