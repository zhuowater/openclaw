const crypto = require('crypto');
const https = require('https');
const { SocksProxyAgent } = require('socks-proxy-agent');

/**
 * X API Client with OAuth 1.0a signing and SOCKS5 proxy support
 */
class XAPIClient {
  constructor() {
    this.apiKey = process.env.X_API_KEY;
    this.apiSecret = process.env.X_API_SECRET;
    this.accessToken = process.env.X_ACCESS_TOKEN;
    this.accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
    this.bearerToken = process.env.X_BEARER_TOKEN;
    
    // SOCKS5 proxy for bypassing GFW
    this.proxyAgent = new SocksProxyAgent('socks5h://127.0.0.1:7880');
    
    if (!this.apiKey || !this.apiSecret || !this.accessToken || !this.accessTokenSecret) {
      throw new Error('Missing required X API credentials. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET');
    }
  }

  /**
   * Generate OAuth 1.0a signature
   */
  generateOAuthSignature(method, url, params = {}) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(32).toString('base64').replace(/\W/g, '');

    // OAuth parameters
    const oauthParams = {
      oauth_consumer_key: this.apiKey,
      oauth_token: this.accessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_nonce: nonce,
      oauth_version: '1.0'
    };

    // Combine all parameters
    const allParams = { ...params, ...oauthParams };

    // Sort parameters alphabetically
    const sortedParams = Object.keys(allParams)
      .sort()
      .map(key => `${this.percentEncode(key)}=${this.percentEncode(allParams[key])}`)
      .join('&');

    // Create signature base string
    const signatureBaseString = [
      method.toUpperCase(),
      this.percentEncode(url),
      this.percentEncode(sortedParams)
    ].join('&');

    // Create signing key
    const signingKey = `${this.percentEncode(this.apiSecret)}&${this.percentEncode(this.accessTokenSecret)}`;

    // Generate signature
    const signature = crypto
      .createHmac('sha1', signingKey)
      .update(signatureBaseString)
      .digest('base64');

    oauthParams.oauth_signature = signature;

    return oauthParams;
  }

  /**
   * Generate OAuth 1.0a Authorization header
   */
  generateOAuthHeader(method, url, params = {}) {
    const oauthParams = this.generateOAuthSignature(method, url, params);
    
    const headerValue = 'OAuth ' + Object.keys(oauthParams)
      .sort()
      .map(key => `${this.percentEncode(key)}="${this.percentEncode(oauthParams[key])}"`)
      .join(', ');

    return headerValue;
  }

  /**
   * Percent encode as per OAuth spec
   */
  percentEncode(str) {
    return encodeURIComponent(str)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  }

  /**
   * Transient error codes that are safe to retry
   */
  static RETRYABLE_ERRORS = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH', 'ESOCKETTIMEDOUT'];
  static MAX_RETRIES = 3;
  static BASE_DELAY_MS = 2000;

  /**
   * Make HTTP request with OAuth 1.0a (with automatic retry for transient errors)
   */
  async request(method, path, options = {}) {
    const { body, queryParams = {}, useBearerToken = false } = options;
    
    const baseUrl = path.includes('upload.twitter.com') 
      ? path 
      : `https://api.x.com${path}`;
    
    // Build query string
    let url = baseUrl;
    if (Object.keys(queryParams).length > 0) {
      const queryString = Object.keys(queryParams)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
        .join('&');
      url += `?${queryString}`;
    }

    const urlObj = new URL(url);

    let lastError;
    for (let attempt = 0; attempt <= XAPIClient.MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = XAPIClient.BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 500);
        await new Promise(r => setTimeout(r, delay + jitter));
      }

      try {
        // Re-generate OAuth header on each attempt (nonce + timestamp must be fresh)
        const headers = { 'User-Agent': 'OpenClaw-XAPI/1.0' };
        if (useBearerToken && this.bearerToken) {
          headers['Authorization'] = `Bearer ${this.bearerToken}`;
        } else {
          headers['Authorization'] = this.generateOAuthHeader(method, baseUrl, queryParams);
        }
        if (body) {
          headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
        }

        const result = await this._doRequest(method, urlObj, headers, body);
        return result;
      } catch (err) {
        lastError = err;
        const code = err && (err.code || (err.cause && err.cause.code));
        const isRetryable = code && XAPIClient.RETRYABLE_ERRORS.includes(code);
        const isServerError = err && err.statusCode && err.statusCode >= 500;

        if ((isRetryable || isServerError) && attempt < XAPIClient.MAX_RETRIES) {
          continue; // retry
        }
        throw err;
      }
    }
    throw lastError;
  }

  /**
   * Single HTTP request attempt (no retry logic)
   */
  _doRequest(method, urlObj, headers, body) {
    return new Promise((resolve, reject) => {
      const requestOptions = {
        method,
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers,
        agent: this.proxyAgent,
        timeout: 45000
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject({
                statusCode: res.statusCode,
                error: parsed
              });
            }
          } catch (err) {
            reject({
              statusCode: res.statusCode,
              error: data,
              parseError: err.message
            });
          }
        });
      });

      req.on('timeout', () => {
        const err = new Error('Request timed out after 45s');
        err.code = 'ESOCKETTIMEDOUT';
        req.destroy(err);
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Upload media (multipart) - for images/videos
   */
  async uploadMedia(filePath) {
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = `----OpenClawBoundary${Date.now()}`;
    
    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const urlObj = new URL(url);
    
    const headers = {
      'Authorization': this.generateOAuthHeader('POST', url, {}),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'User-Agent': 'OpenClaw-XAPI/1.0'
    };

    // Build multipart body
    const parts = [];
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="media"; filename="${fileName}"\r\n`);
    parts.push('Content-Type: application/octet-stream\r\n\r\n');
    
    const header = Buffer.from(parts.join(''));
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);

    headers['Content-Length'] = body.length;

    return new Promise((resolve, reject) => {
      const requestOptions = {
        method: 'POST',
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        headers,
        agent: this.proxyAgent
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject({
                statusCode: res.statusCode,
                error: parsed
              });
            }
          } catch (err) {
            reject({
              statusCode: res.statusCode,
              error: data,
              parseError: err.message
            });
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
  /**
   * Download media from a URL and save to local file
   */
  async downloadMedia(mediaUrl, outputPath) {
    const fs = require('fs');
    const pathLib = require('path');
    const http = mediaUrl.startsWith('https') ? https : require('http');
    
    // Ensure output directory exists
    const dir = pathLib.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    return new Promise((resolve, reject) => {
      const req = http.get(mediaUrl, { agent: this.proxyAgent }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.downloadMedia(res.headers.location, outputPath).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const stream = fs.createWriteStream(outputPath);
        res.pipe(stream);
        stream.on('finish', () => {
          stream.close();
          resolve({ path: outputPath, size: fs.statSync(outputPath).size });
        });
        stream.on('error', reject);
      });
      req.on('error', reject);
    });
  }
}

module.exports = XAPIClient;
