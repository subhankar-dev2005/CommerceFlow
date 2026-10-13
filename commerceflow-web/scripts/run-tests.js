import { spawn } from 'node:child_process';
import process from 'node:process';

process.env.JITI_JSX = '1';

const rawArgs = process.argv.slice(2);
// Filter out --runInBand if passed by caller
const filteredArgs = rawArgs.filter((arg) => arg !== '--runInBand');

// Run tests serially using Node's native test runner with jiti for JSX support
const defaultGlobs = filteredArgs.length === 0 ? ['src/**/*.test.js', 'src/**/*.test.jsx'] : filteredArgs;

const nodeArgs = [
  '--import=jiti/register',
  '--test',
  '--test-concurrency=1',
  ...defaultGlobs,
];

const child = spawn(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
