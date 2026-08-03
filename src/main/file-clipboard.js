/**
 * Windows 文件剪贴板模块 — 将本地文件写入资源管理器可粘贴的文件列表。
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_FILE_COUNT = 1000;
const POWERSHELL_TIMEOUT = 10000;
const SET_FILE_DROP_LIST_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$inputBase64 = [Console]::In.ReadToEnd()',
  '$inputJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($inputBase64))',
  '$filePaths = ConvertFrom-Json -InputObject $inputJson',
  '$files = New-Object System.Collections.Specialized.StringCollection',
  'foreach ($file in @($filePaths)) { [void]$files.Add([string]$file) }',
  '[System.Windows.Forms.Clipboard]::SetFileDropList($files)',
].join('; ');
const ENCODED_POWERSHELL_SCRIPT = Buffer
  .from(SET_FILE_DROP_LIST_SCRIPT, 'utf16le')
  .toString('base64');

/**
 * 将文件路径写入 Windows 文件剪贴板。
 * @param {string[]} filePaths - 要复制的绝对文件路径
 * @returns {Promise<number>} 已复制的文件数量
 */
function copyFilesToClipboard(filePaths) {
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('复制为文件仅支持 Windows'));
  }

  const validPaths = [...new Set(filePaths)]
    .filter(filePath => typeof filePath === 'string' && path.isAbsolute(filePath))
    .filter(filePath => {
      try {
        return fs.statSync(filePath).isFile();
      } catch (err) {
        return false;
      }
    });

  if (validPaths.length === 0) {
    return Promise.reject(new Error('未找到可复制的图片文件'));
  }
  if (validPaths.length > MAX_FILE_COUNT) {
    return Promise.reject(new Error(`一次最多复制 ${MAX_FILE_COUNT} 个文件`));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-EncodedCommand',
        ENCODED_POWERSHELL_SCRIPT,
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'pipe'],
      }
    );

    let settled = false;
    let errorOutput = '';
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('写入文件剪贴板超时'));
    }, POWERSHELL_TIMEOUT);

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      errorOutput += chunk;
    });
    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`无法启动文件剪贴板进程: ${err.message}`));
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const detail = errorOutput.trim() || `退出代码 ${code}`;
        reject(new Error(`写入文件剪贴板失败: ${detail}`));
        return;
      }
      resolve(validPaths.length);
    });

    child.stdin.on('error', err => {
      if (settled) return;
      if (err.code === 'EPIPE') return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`发送文件路径失败: ${err.message}`));
    });
    const encodedPaths = Buffer
      .from(JSON.stringify(validPaths), 'utf8')
      .toString('base64');
    child.stdin.end(encodedPaths);
  });
}

module.exports = {
  copyFilesToClipboard,
  MAX_FILE_COUNT,
};
