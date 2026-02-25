const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

const WORKSPACE = '/root/openclaw';

/**
 * 提取 Markdown 文件中的所有链接
 * @param {string} content - Markdown 内容
 * @returns {Array<{url: string, line: number}>}
 */
function extractLinks(content) {
  const links = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // [text](url) 格式
    const mdLinks = line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    for (const match of mdLinks) {
      links.push({ url: match[2], line: idx + 1 });
    }

    // <url> 格式（直接URL）
    const directUrls = line.matchAll(/<(https?:\/\/[^>]+)>/g);
    for (const match of directUrls) {
      links.push({ url: match[1], line: idx + 1 });
    }

    // 裸 URL（http:// 或 https://）
    const bareUrls = line.matchAll(/(?<![(\[])https?:\/\/[^\s)>\]]+/g);
    for (const match of bareUrls) {
      links.push({ url: match[0], line: idx + 1 });
    }
  });

  return links;
}

/**
 * 检查 HTTP(S) 链接状态
 * @param {string} url
 * @returns {Promise<{ok: boolean, status?: number, reason?: string}>}
 */
async function checkHttpLink(url) {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      timeout: 5000,
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    // HEAD 失败回退 GET
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        timeout: 5000,
      });
      return { ok: response.ok, status: response.status };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }
}

/**
 * 检查本地文件路径是否存在
 * @param {string} filePath
 * @param {string} baseDir - 引用文件所在目录
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function checkLocalPath(filePath, baseDir) {
  // 如果是绝对路径
  if (path.isAbsolute(filePath)) {
    try {
      await fs.access(filePath);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'File not found' };
    }
  }

  // 相对路径：相对于引用文件目录
  const fullPath = path.resolve(baseDir, filePath);
  try {
    await fs.access(fullPath);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'File not found' };
  }
}

/**
 * 检查单个链接
 * @param {string} url
 * @param {string} baseDir - 引用文件所在目录
 * @returns {Promise<{url: string, ok: boolean, status?: number, reason?: string}>}
 */
async function checkSingleLink(url, baseDir) {
  // 跳过锚点和 mailto
  if (url.startsWith('#') || url.startsWith('mailto:')) {
    return { url, ok: true, status: 'skipped' };
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    const result = await checkHttpLink(url);
    return { url, ...result };
  } else {
    // 本地文件路径
    const result = await checkLocalPath(url, baseDir);
    return { url, ...result };
  }
}

/**
 * 检查文件中的所有链接
 * @param {string} filePath - 文件路径（相对或绝对）
 * @returns {Promise<Array<{file: string, line: number, url: string, ok: boolean, status?: number, reason?: string}>>}
 */
async function checkFileLinks(filePath) {
  const fullPath = path.resolve(WORKSPACE, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const links = extractLinks(content);
  const baseDir = path.dirname(fullPath);

  const results = await Promise.all(
    links.map(async ({ url, line }) => {
      const check = await checkSingleLink(url, baseDir);
      return {
        file: filePath,
        line,
        url,
        ok: check.ok,
        status: check.status,
        reason: check.reason,
      };
    })
  );

  return results;
}

/**
 * 批量检查多个文件
 * @param {Array<string>} patterns - 文件路径或 glob 模式
 * @returns {Promise<Array>}
 */
async function checkLinks(patterns) {
  const files = [];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const matched = await glob(pattern, { cwd: WORKSPACE });
      files.push(...matched);
    } else {
      files.push(pattern);
    }
  }

  const allResults = [];
  for (const file of files) {
    try {
      const results = await checkFileLinks(file);
      allResults.push(...results);
    } catch (err) {
      console.error(`Error checking ${file}:`, err.message);
    }
  }

  return allResults;
}

module.exports = { checkLinks, checkFileLinks };
