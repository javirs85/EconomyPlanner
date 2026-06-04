import { spawn } from 'node:child_process'

const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' }),
]

function stop() {
  for (const child of children) child.kill()
}

for (const child of children) {
  child.on('exit', (code) => {
    stop()
    process.exit(code ?? 0)
  })
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
