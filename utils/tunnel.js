const { spawn } = require('child_process');
const path = require('path');

function startTunnel(port) {
  this._started = false;
  this._sshProc = null;

  console.log('\n  正在创建公网隧道...');

  const child = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=60',
    '-o', 'ServerAliveCountMax=3',
    '-R', `80:localhost:${port}`,
    'serveo.net'
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  this._sshProc = child;

  let urlFound = false;

  child.stdout.on('data', (data) => {
    const text = data.toString();
    const urlMatch = text.match(/https:\/\/[a-zA-Z0-9._-]+\.serveousercontent\.com/);
    if (urlMatch && !urlFound) {
      urlFound = true;
      this._started = true;
      const url = urlMatch[0];
      console.log('\n  ┌──────────────────────────────────────────────────────────┐');
      console.log(`  │  外网访问: ${url.padEnd(49)}│`);
      console.log('  │  (任何网络下的设备均可访问此地址)                          │');
      console.log('  └──────────────────────────────────────────────────────────┘\n');
    }
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    const urlMatch = text.match(/https:\/\/[a-zA-Z0-9._-]+\.serveousercontent\.com/);
    if (urlMatch && !urlFound) {
      urlFound = true;
      this._started = true;
      const url = urlMatch[0];
      console.log('\n  ┌──────────────────────────────────────────────────────────┐');
      console.log(`  │  外网访问: ${url.padEnd(49)}│`);
      console.log('  │  (任何网络下的设备均可访问此地址)                          │');
      console.log('  └──────────────────────────────────────────────────────────┘\n');
    }
    if (text.includes('Permission denied') || text.includes('Connection refused') || text.includes('No route')) {
      console.log('\n  ⚠ SSH 隧道连接失败:', text.trim(), '\n');
    }
  });

  child.on('error', (err) => {
    console.log('\n  ⚠ 公网隧道启动失败:', err.message, '\n');
  });

  child.on('close', () => {
    if (!urlFound) {
      console.log('\n  ⚠ 公网隧道已关闭，系统仍可通过局域网地址正常访问\n');
    }
  });
}

module.exports = { startTunnel };
