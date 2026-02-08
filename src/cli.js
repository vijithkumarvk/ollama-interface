import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { PrivateAgent } from './agent.js';
import fs from 'fs/promises';

class OpenClawCLI {
  constructor() {
    this.agent = null;
    this.running = true;
  }

  async init() {
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║   Private Agent - Terminal Mode        ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════╝\n'));

    const spinner = ora('Connecting to Ollama...').start();

    this.agent = new PrivateAgent({
      ollamaUrl: 'http://localhost:11434',
      maxContextTokens: 4096,
      source: 'cli',
      consoleLog: true
    });

    const isConnected = await this.agent.checkConnection();

    if (!isConnected) {
      spinner.fail('Failed to connect to Ollama');
      console.log(chalk.yellow('\nMake sure Ollama is running on http://localhost:11434'));
      console.log(chalk.gray('Start Ollama with: ollama serve\n'));
      process.exit(1);
    }

    spinner.succeed('Connected to Ollama');

    await this.selectModel();
    await this.mainLoop();
  }

  async selectModel() {
    const spinner = ora('Fetching available models...').start();
    
    try {
      const models = await this.agent.listModels();
      spinner.stop();

      if (models.length === 0) {
        console.log(chalk.yellow('\nNo models found. Pull a model first:'));
        console.log(chalk.gray('  ollama pull llama2\n'));
        process.exit(1);
      }

      const modelChoices = models.map(m => ({
        name: `${m.name} (${(m.size / 1e9).toFixed(2)} GB)`,
        value: m.name
      }));

      const { selectedModel } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedModel',
          message: 'Select a model:',
          choices: modelChoices
        }
      ]);

      this.agent.setModel(selectedModel);
      console.log(chalk.green(`✓ Model set to: ${selectedModel}\n`));
    } catch (error) {
      spinner.fail('Failed to fetch models');
      console.log(chalk.red(error.message));
      process.exit(1);
    }
  }

  async mainLoop() {
    while (this.running) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '💬 Chat', value: 'chat' },
            { name: '🔄 Change Model', value: 'model' },
            { name: '⚙️  Settings', value: 'settings' },
            { name: '🔧 System Tools', value: 'tools' },
            { name: '📜 View History', value: 'history' },
            { name: '💾 Export History', value: 'export' },
            { name: '📥 Import History', value: 'import' },
            { name: '🗑️  Clear History', value: 'clear' },
            { name: '❌ Exit', value: 'exit' }
          ]
        }
      ]);

      switch (action) {
        case 'chat':
          await this.chatMode();
          break;
        case 'model':
          await this.selectModel();
          break;
        case 'settings':
          await this.settingsMenu();
          break;
        case 'tools':
          await this.toolsMenu();
          break;
        case 'history':
          await this.viewHistory();
          break;
        case 'export':
          await this.exportHistory();
          break;
        case 'import':
          await this.importHistory();
          break;
        case 'clear':
          await this.clearHistory();
          break;
        case 'exit':
          this.running = false;
          console.log(chalk.cyan('\nGoodbye! 👋\n'));
          break;
      }
    }
  }

  async chatMode() {
    console.log(chalk.gray('\n─── Chat Mode (type "exit" to return) ───\n'));

    let chatting = true;

    while (chatting) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.blue('You:'),
          validate: (input) => input.trim() !== '' || 'Please enter a message'
        }
      ]);

      if (message.toLowerCase() === 'exit') {
        chatting = false;
        console.log(chalk.gray('\n─── Exiting chat mode ───\n'));
        continue;
      }

      // Create a beautiful spinner
      const spinner = ora({
        text: chalk.gray('Thinking...'),
        color: 'cyan',
        spinner: {
          interval: 80,
          frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        }
      }).start();

      try {
        let response = '';
        let firstChunk = true;
        
        await this.agent.streamChat(
          message,
          (chunk) => {
            if (firstChunk) {
              spinner.stop();
              console.log(chalk.green('\nAssistant:\n'));
              firstChunk = false;
            }
            process.stdout.write(chalk.white(chunk));
            response += chunk;
          }
        );
        
        console.log('\n');
      } catch (error) {
        spinner.fail(chalk.red('Error'));
        console.log(chalk.red(`${error.message}\n`));
      }
    }
  }

  async settingsMenu() {
    const { setting } = await inquirer.prompt([
      {
        type: 'list',
        name: 'setting',
        message: 'Settings:',
        choices: [
          { name: '📝 Set System Prompt', value: 'prompt' },
          { name: '🔢 Set Max Context Tokens', value: 'tokens' },
          { name: '🌡️  Set Temperature', value: 'temp' },
          { name: '← Back', value: 'back' }
        ]
      }
    ]);

    if (setting === 'back') return;

    switch (setting) {
      case 'prompt':
        const { prompt } = await inquirer.prompt([
          {
            type: 'input',
            name: 'prompt',
            message: 'Enter system prompt:',
            default: this.agent.systemPrompt
          }
        ]);
        this.agent.setSystemPrompt(prompt);
        console.log(chalk.green('✓ System prompt updated\n'));
        break;
      
      case 'tokens':
        const { tokens } = await inquirer.prompt([
          {
            type: 'number',
            name: 'tokens',
            message: 'Enter max context tokens:',
            default: this.agent.maxContextTokens,
            validate: (val) => val > 0 || 'Must be positive'
          }
        ]);
        this.agent.maxContextTokens = tokens;
        console.log(chalk.green('✓ Max context tokens updated\n'));
        break;
    }
  }

  async viewHistory() {
    const history = this.agent.getHistory();
    
    if (history.length === 0) {
      console.log(chalk.yellow('\nNo conversation history yet.\n'));
      return;
    }

    console.log(chalk.bold('\n═══ Conversation History ═══\n'));
    
    history.forEach((msg, idx) => {
      const roleColor = msg.role === 'user' ? chalk.blue : chalk.green;
      const roleLabel = msg.role === 'user' ? 'You' : 'Assistant';
      console.log(roleColor(`${roleLabel}:`));
      console.log(chalk.white(msg.content));
      console.log(chalk.gray('─'.repeat(50)));
    });
    
    console.log();
  }

  async exportHistory() {
    try {
      const exported = this.agent.exportHistory();
      const filename = `ollama-interface-history-${Date.now()}.json`;
      await fs.writeFile(filename, exported);
      console.log(chalk.green(`\n✓ History exported to: ${filename}\n`));
    } catch (error) {
      console.log(chalk.red(`\nFailed to export: ${error.message}\n`));
    }
  }

  async importHistory() {
    const { filename } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filename',
        message: 'Enter history file path:',
        validate: (input) => input.trim() !== '' || 'Please enter a filename'
      }
    ]);

    try {
      const data = await fs.readFile(filename, 'utf-8');
      this.agent.importHistory(data);
      console.log(chalk.green('\n✓ History imported successfully\n'));
    } catch (error) {
      console.log(chalk.red(`\nFailed to import: ${error.message}\n`));
    }
  }

  async clearHistory() {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Clear conversation history?',
        default: false
      }
    ]);

    if (confirm) {
      this.agent.clearHistory();
      console.log(chalk.green('\n✓ History cleared\n'));
    }
  }

  async toolsMenu() {
    const systemTools = this.agent.getSystemTools();
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'System Tools:',
        choices: [
          { name: '💻 System Information', value: 'sysinfo' },
          { name: '📁 Current Directory', value: 'pwd' },
          { name: '📂 List Files', value: 'ls' },
          { name: '📄 Read File', value: 'read' },
          { name: '⚡ Execute Command', value: 'exec' },
          { name: '🔧 Toggle Tools', value: 'toggle' },
          { name: '📜 Tool History', value: 'history' },
          { name: '← Back', value: 'back' }
        ]
      }
    ]);

    if (action === 'back') return;

    try {
      switch (action) {
        case 'sysinfo':
          const sysInfo = await systemTools.getSystemInfo();
          console.log(chalk.bold('\n═══ System Information ═══\n'));
          Object.entries(sysInfo).forEach(([key, value]) => {
            console.log(chalk.cyan(`${key.padEnd(15)}: `) + chalk.white(value));
          });
          console.log();
          break;

        case 'pwd':
          const cwd = systemTools.getCurrentDirectory();
          console.log(chalk.green('\n✓ Current Directory:'), chalk.white(cwd), '\n');
          break;

        case 'ls':
          const { lsPath } = await inquirer.prompt([
            {
              type: 'input',
              name: 'lsPath',
              message: 'Directory path:',
              default: '.'
            }
          ]);
          
          const files = await systemTools.listDirectory(lsPath, { detailed: true });
          console.log(chalk.bold(`\n═══ Files in ${lsPath} ═══\n`));
          files.forEach(file => {
            const icon = file.isDirectory ? '📁' : '📄';
            const name = file.isDirectory ? chalk.blue(file.name) : chalk.white(file.name);
            const size = file.size ? `(${(file.size / 1024).toFixed(2)} KB)` : '';
            console.log(`${icon} ${name} ${chalk.gray(size)}`);
          });
          console.log();
          break;

        case 'read':
          const { readPath } = await inquirer.prompt([
            {
              type: 'input',
              name: 'readPath',
              message: 'File path to read:'
            }
          ]);
          
          const spinner = ora('Reading file...').start();
          const fileContent = await systemTools.readFile(readPath);
          spinner.succeed('File read successfully');
          
          console.log(chalk.bold('\n═══ File Content ═══\n'));
          console.log(chalk.white(fileContent.content));
          console.log(chalk.gray(`\n(${fileContent.size} bytes, modified: ${fileContent.modified})\n`));
          break;

        case 'exec':
          const { command } = await inquirer.prompt([
            {
              type: 'input',
              name: 'command',
              message: 'Command to execute:',
              validate: (input) => input.trim() !== '' || 'Please enter a command'
            }
          ]);

          const { confirmExec } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmExec',
              message: `Execute: ${command}?`,
              default: false
            }
          ]);

          if (confirmExec) {
            const execSpinner = ora('Executing command...').start();
            try {
              const result = await systemTools.executeCommand(command);
              execSpinner.succeed('Command completed');
              
              console.log(chalk.bold('\n═══ Output ═══\n'));
              if (result.stdout) console.log(chalk.white(result.stdout));
              if (result.stderr) console.log(chalk.yellow(result.stderr));
              console.log(chalk.gray(`\nExit code: ${result.exitCode}`));
              console.log(chalk.gray(`Execution time: ${result.executionTime}ms\n`));
            } catch (error) {
              execSpinner.fail('Command failed');
              console.log(chalk.red(`\nError: ${error.message}\n`));
            }
          }
          break;

        case 'toggle':
          const currentState = this.agent.enableTools;
          const { enableTools } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'enableTools',
              message: 'Enable system tools?',
              default: currentState
            }
          ]);
          
          this.agent.setToolsEnabled(enableTools);
          console.log(chalk.green(`\n✓ Tools ${enableTools ? 'enabled' : 'disabled'}\n`));
          break;

        case 'history':
          const toolHistory = this.agent.getToolCallHistory();
          if (toolHistory.length === 0) {
            console.log(chalk.yellow('\nNo tool calls yet.\n'));
          } else {
            console.log(chalk.bold('\n═══ Tool Call History ═══\n'));
            toolHistory.forEach((call, idx) => {
              const status = call.success ? chalk.green('✓') : chalk.red('✗');
              console.log(`${status} ${chalk.cyan(call.function)} ${chalk.gray(`(${call.executionTime}ms)`)}`);
              console.log(chalk.gray(`   ${call.timestamp}`));
              if (call.error) {
                console.log(chalk.red(`   Error: ${call.error}`));
              }
              console.log();
            });
          }
          break;
      }
    } catch (error) {
      console.log(chalk.red(`\nError: ${error.message}\n`));
    }

    // Return to tools menu unless user wants to exit
    const { again } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'again',
        message: 'Return to tools menu?',
        default: true
      }
    ]);

    if (again) {
      await this.toolsMenu();
    }
  }
}

// Run CLI
const cli = new OpenClawCLI();
cli.init().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
