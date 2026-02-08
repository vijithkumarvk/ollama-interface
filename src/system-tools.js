import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export class SystemTools {
  constructor() {
    this.platform = os.platform(); // 'win32', 'linux', 'darwin', etc.
    this.isWindows = this.platform === 'win32';
    this.shell = this.isWindows ? 'powershell.exe' : '/bin/bash';
    this.executionHistory = [];
  }

  /**
   * Get system information
   */
  async getSystemInfo() {
    return {
      platform: this.platform,
      arch: os.arch(),
      hostname: os.hostname(),
      homedir: os.homedir(),
      tmpdir: os.tmpdir(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB',
      uptime: Math.round(os.uptime() / 3600) + ' hours',
      nodeVersion: process.version,
      shell: this.shell
    };
  }

  /**
   * Execute a command safely with timeout
   */
  async executeCommand(command, options = {}) {
    const {
      timeout = 30000,
      cwd = process.cwd(),
      capture = true
    } = options;

    // Security check - block dangerous commands
    if (this.isDangerousCommand(command)) {
      throw new Error('Command blocked for security reasons');
    }

    const startTime = Date.now();
    
    try {
      const result = await execAsync(command, {
        timeout,
        cwd,
        shell: this.shell,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const executionTime = Date.now() - startTime;
      
      const execution = {
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
        executionTime,
        timestamp: new Date().toISOString(),
        cwd
      };

      this.executionHistory.push(execution);
      
      return execution;
    } catch (error) {
      const execution = {
        command,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        cwd,
        error: error.message
      };

      this.executionHistory.push(execution);
      
      return execution;
    }
  }

  /**
   * Execute command with streaming output
   */
  async executeCommandStream(command, onData, options = {}) {
    const { cwd = process.cwd() } = options;

    if (this.isDangerousCommand(command)) {
      throw new Error('Command blocked for security reasons');
    }

    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        shell: this.shell,
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        onData({ type: 'stdout', data: text });
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        onData({ type: 'stderr', data: text });
      });

      child.on('close', (code) => {
        const execution = {
          command,
          stdout,
          stderr,
          exitCode: code,
          timestamp: new Date().toISOString(),
          cwd
        };

        this.executionHistory.push(execution);
        resolve(execution);
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Timeout after 60 seconds
      setTimeout(() => {
        child.kill();
        reject(new Error('Command timeout'));
      }, 60000);
    });
  }

  /**
   * Check if command is potentially dangerous
   */
  isDangerousCommand(command) {
    const lowerCmd = command.toLowerCase();
    
    const dangerousPatterns = [
      /rm\s+-rf\s+\/[^\/]*/,  // rm -rf /something
      /del\s+\/s\s+\/q\s+c:\\/i,  // Windows delete system
      /format\s+c:/i,
      /mkfs/,
      /dd\s+if=/,
      /:(){ :|:& };:/,  // Fork bomb
      /shutdown/,
      /reboot/,
      /init\s+0/,
      /systemctl\s+poweroff/
    ];

    return dangerousPatterns.some(pattern => pattern.test(lowerCmd));
  }

  /**
   * List files in directory
   */
  async listDirectory(dirPath = '.', options = {}) {
    const { detailed = false } = options;
    
    try {
      const fullPath = path.resolve(dirPath);
      const files = await fs.readdir(fullPath, { withFileTypes: true });
      
      if (detailed) {
        const detailedFiles = await Promise.all(
          files.map(async (file) => {
            const filePath = path.join(fullPath, file.name);
            try {
              const stats = await fs.stat(filePath);
              return {
                name: file.name,
                isDirectory: file.isDirectory(),
                isFile: file.isFile(),
                size: stats.size,
                modified: stats.mtime,
                permissions: stats.mode.toString(8).slice(-3)
              };
            } catch (error) {
              return {
                name: file.name,
                isDirectory: file.isDirectory(),
                isFile: file.isFile(),
                error: 'Unable to read stats'
              };
            }
          })
        );
        return detailedFiles;
      }
      
      return files.map(f => ({
        name: f.name,
        isDirectory: f.isDirectory()
      }));
    } catch (error) {
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }

  /**
   * Read file content
   */
  async readFile(filePath, options = {}) {
    const { encoding = 'utf8', maxSize = 1024 * 1024 } = options; // 1MB default max
    
    try {
      const fullPath = path.resolve(filePath);
      const stats = await fs.stat(fullPath);
      
      if (stats.size > maxSize) {
        throw new Error(`File too large (${stats.size} bytes). Max: ${maxSize} bytes`);
      }
      
      const content = await fs.readFile(fullPath, encoding);
      
      return {
        path: fullPath,
        size: stats.size,
        content,
        modified: stats.mtime
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Write file content
   */
  async writeFile(filePath, content, options = {}) {
    const { encoding = 'utf8', append = false } = options;
    
    try {
      const fullPath = path.resolve(filePath);
      
      if (append) {
        await fs.appendFile(fullPath, content, encoding);
      } else {
        await fs.writeFile(fullPath, content, encoding);
      }
      
      return {
        path: fullPath,
        size: content.length,
        success: true
      };
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  /**
   * Get current working directory
   */
  getCurrentDirectory() {
    return process.cwd();
  }

  /**
   * Change directory
   */
  changeDirectory(dirPath) {
    try {
      const fullPath = path.resolve(dirPath);
      process.chdir(fullPath);
      return {
        success: true,
        cwd: process.cwd()
      };
    } catch (error) {
      throw new Error(`Failed to change directory: ${error.message}`);
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 10) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory() {
    this.executionHistory = [];
  }

  /**
   * Get environment variables
   */
  getEnvironmentVariables() {
    return process.env;
  }

  /**
   * Get specific environment variable
   */
  getEnvironmentVariable(name) {
    return process.env[name];
  }

  /**
   * Create directory
   */
  async createDirectory(dirPath, options = {}) {
    const { recursive = true } = options;
    
    try {
      const fullPath = path.resolve(dirPath);
      await fs.mkdir(fullPath, { recursive });
      
      return {
        path: fullPath,
        success: true
      };
    } catch (error) {
      throw new Error(`Failed to create directory: ${error.message}`);
    }
  }

  /**
   * Delete file or directory
   */
  async delete(targetPath, options = {}) {
    const { recursive = false } = options;
    
    try {
      const fullPath = path.resolve(targetPath);
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive, force: true });
      } else {
        await fs.unlink(fullPath);
      }
      
      return {
        path: fullPath,
        success: true
      };
    } catch (error) {
      throw new Error(`Failed to delete: ${error.message}`);
    }
  }

  /**
   * Get common commands for the current OS
   */
  getCommonCommands() {
    if (this.isWindows) {
      return {
        listFiles: 'dir',
        currentDir: 'cd',
        systemInfo: 'systeminfo',
        processes: 'tasklist',
        diskSpace: 'wmic logicaldisk get size,freespace,caption',
        networkInfo: 'ipconfig',
        ping: 'ping',
        environmentVars: 'set',
        path: 'echo %PATH%',
        whoami: 'whoami',
        date: 'date /t',
        time: 'time /t'
      };
    } else {
      return {
        listFiles: 'ls -la',
        currentDir: 'pwd',
        systemInfo: 'uname -a',
        processes: 'ps aux',
        diskSpace: 'df -h',
        networkInfo: 'ifconfig',
        ping: 'ping',
        environmentVars: 'env',
        path: 'echo $PATH',
        whoami: 'whoami',
        date: 'date',
        uptime: 'uptime'
      };
    }
  }
}
