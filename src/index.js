#!/usr/bin/env node

console.log(`
╔════════════════════════════════════════╗
║        Private Agent CLI               ║
╚════════════════════════════════════════╝

Available commands:
  npm run cli  - Start terminal interface
  npm run web  - Start web interface
  
For more info, see README.md
`);

// Default to CLI mode if run directly
import('./cli.js');
