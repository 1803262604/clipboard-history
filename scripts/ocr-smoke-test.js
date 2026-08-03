/**
 * OCR 冒烟测试 - 验证 Electron、WASM worker 和本地语言模型可正常启动。
 */

const path = require('path');
const { app, BrowserWindow } = require('electron');

const testDataPath = path.join(__dirname, '..', 'work', 'ocr-smoke-user-data');
app.setPath('userData', testDataPath);
app.setPath('sessionData', path.join(testDataPath, 'session'));
app.commandLine.appendSwitch('disable-gpu');

const ocrService = require('../src/main/ocr-service');

app.whenReady().then(async () => {
  let exitCode = 0;
  const testWindow = new BrowserWindow({
    width: 900,
    height: 260,
    show: false,
    webPreferences: {
      offscreen: true,
    },
  });

  try {
    const html = encodeURIComponent(`
      <!DOCTYPE html>
      <html lang="zh-CN">
        <body style="margin:0;padding:36px;background:#fff;color:#000;font:64px 'Microsoft YaHei',sans-serif;">
          <div>中文识别</div>
          <div>OCR TEST 123</div>
        </body>
      </html>
    `);
    await testWindow.loadURL(`data:text/html;charset=utf-8,${html}`);
    const image = await testWindow.webContents.capturePage();
    const text = await ocrService.recognizeText(image.toPNG());
    if (!text.includes('中文') || !text.toUpperCase().includes('OCR')) {
      throw new Error(`识别结果不符合预期：${text}`);
    }
    console.log(`OCR 冒烟测试通过（开发环境），识别字符数：${Array.from(text).length}`);
  } catch (error) {
    console.error('OCR 冒烟测试失败:', error);
    exitCode = 1;
  } finally {
    testWindow.destroy();
    await ocrService.terminate();
    app.exit(exitCode);
  }
});
