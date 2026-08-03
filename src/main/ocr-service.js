/**
 * 图片文字识别服务 - 使用本地 Tesseract 模型按需识别图片。
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { createWorker, OEM, PSM } = require('tesseract.js');

const IDLE_TIMEOUT_MS = 60 * 1000;
const LANGUAGE_SOURCES = [
  {
    code: 'chi_sim',
    packageName: '@tesseract.js-data/chi_sim',
  },
  {
    code: 'eng',
    packageName: '@tesseract.js-data/eng',
  },
];

let workerPromise = null;
let idleTimer = null;
let isRecognizing = false;
let progressListener = null;

function createUserError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.userMessage = message;
  return error;
}

function getUnpackedPath(filePath) {
  if (!app.isPackaged) return filePath;
  return filePath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
}

async function prepareLanguageDirectory() {
  const modelDirectory = path.join(app.getPath('userData'), 'ocr-models-v1');
  await fs.promises.mkdir(modelDirectory, { recursive: true });

  await Promise.all(LANGUAGE_SOURCES.map(async ({ code, packageName }) => {
    const packageEntry = require.resolve(packageName);
    const sourcePath = path.join(
      path.dirname(packageEntry),
      '4.0.0_best_int',
      `${code}.traineddata.gz`
    );
    const targetPath = path.join(modelDirectory, `${code}.traineddata.gz`);
    const sourceStat = await fs.promises.stat(sourcePath);

    try {
      const targetStat = await fs.promises.stat(targetPath);
      if (targetStat.size === sourceStat.size) return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const data = await fs.promises.readFile(sourcePath);
    await fs.promises.writeFile(targetPath, data);
  }));

  return modelDirectory;
}

function reportProgress(message) {
  if (progressListener) {
    try {
      progressListener(message);
    } catch (error) {
      console.warn('[OCR] 进度回传失败:', error.message);
    }
  }
}

async function createOcrWorker() {
  const langPath = await prepareLanguageDirectory();
  const workerPath = getUnpackedPath(
    require.resolve('tesseract.js/src/worker-script/node/index.js')
  );
  const worker = await createWorker('chi_sim+eng', OEM.LSTM_ONLY, {
    workerPath,
    langPath,
    cacheMethod: 'none',
    logger: reportProgress,
    errorHandler: error => {
      console.error('[OCR worker] Error:', error);
    },
  });

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
  });
  return worker;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch(error => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

async function terminate() {
  clearIdleTimer();
  progressListener = null;
  const currentWorker = workerPromise;
  workerPromise = null;
  if (!currentWorker) return;

  try {
    const worker = await currentWorker;
    await worker.terminate();
  } catch (error) {
    console.error('[OCR] 释放识别服务失败:', error.message);
  }
}

function scheduleIdleTermination() {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    if (!isRecognizing) {
      void terminate();
    }
  }, IDLE_TIMEOUT_MS);
  idleTimer.unref();
}

async function recognizeText(imageSource, onProgress) {
  if (isRecognizing) {
    throw createUserError('已有图片正在识别，请稍候', 'OCR_BUSY');
  }
  const isImageBuffer = Buffer.isBuffer(imageSource);
  if (!isImageBuffer && (!imageSource || !fs.existsSync(imageSource))) {
    throw createUserError('图片文件不存在', 'OCR_IMAGE_NOT_FOUND');
  }

  isRecognizing = true;
  clearIdleTimer();

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      progressListener = onProgress;
      try {
        const worker = await getWorker();
        const result = await worker.recognize(imageSource);
        const text = String(result?.data?.text || '')
          .replace(/\r\n?/g, '\n')
          .trim();

        if (!text) {
          throw createUserError('未识别到可复制的文字', 'OCR_NO_TEXT');
        }
        return text;
      } catch (error) {
        if (error.userMessage) throw error;
        console.error(`[OCR] 第 ${attempt + 1} 次识别失败:`, error);
        await terminate();
        if (attempt === 1) {
          throw createUserError(
            `文字识别失败：${String(error.message || error).substring(0, 120)}`,
            'OCR_FAILED'
          );
        }
      }
    }
  } finally {
    isRecognizing = false;
    progressListener = null;
    if (workerPromise) {
      scheduleIdleTermination();
    }
  }
}

module.exports = {
  recognizeText,
  terminate,
};
