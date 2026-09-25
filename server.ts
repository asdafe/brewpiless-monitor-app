import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Strict Read-Only ESP32 Proxy
  app.get('/api/esp32/proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    const timeoutMs = Math.min(Math.max(Number(req.query.timeout) || 5000, 1000), 15000);

    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing target URL parameter' });
    }

    try {
      const parsedUrl = new URL(targetUrl);
      const pathname = parsedUrl.pathname;
      const search = parsedUrl.search;

      // Security check: Only allow safe read-only endpoints
      const allowedPaths = ['/getstatus', '/fs', '/time', '/loglist.php', '/pid'];
      const isAllowed = allowedPaths.some(p => pathname === p || pathname.endsWith(p));

      if (!isAllowed) {
        return res.status(403).json({
          error: `Endpoint '${pathname}' is prohibited. Only read-only endpoints (/getstatus, /fs, /time, /loglist.php, /pid?fmt=text) are allowed.`
        });
      }

      // Safety check for /loglist.php - prohibit dangerous write/delete parameters
      if (pathname.includes('/loglist.php') && search && search.length > 1) {
        return res.status(403).json({
          error: 'Query parameters on /loglist.php are strictly prohibited in read-only mode.'
        });
      }

      // Safety check for /pid - only allow ?fmt=text
      if (pathname.includes('/pid')) {
        if (search !== '?fmt=text' && search !== '') {
          return res.status(403).json({
            error: '/pid only supports ?fmt=text'
          });
        }
      }

      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'User-Agent': 'BrewPiLessMonitor-Android/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || '';
      const lowerContentType = contentType.toLowerCase();

      const rawText = await response.text();
      let jsonData: any = null;
      let isJson = false;

      if (lowerContentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
        try {
          jsonData = JSON.parse(rawText);
          isJson = true;
        } catch {
          isJson = false;
        }
      }

      // If not JSON but contains space-separated key:value pairs (like BrewPiLess /fs)
      if (!isJson && (pathname.endsWith('/fs') || (rawText.includes('totalBytes:') && rawText.includes('usedBytes:')))) {
        try {
          const parsedObj: Record<string, any> = {};
          const pairs = rawText.trim().split(/\s+/);
          for (const pair of pairs) {
            const splitIdx = pair.indexOf(':');
            if (splitIdx > 0) {
              const k = pair.slice(0, splitIdx).trim();
              const v = pair.slice(splitIdx + 1).trim();
              const n = Number(v);
              parsedObj[k] = isNaN(n) ? v : n;
            }
          }
          if (Object.keys(parsedObj).length > 0) {
            if (parsedObj.heap !== undefined && parsedObj.freeHeap === undefined) {
              parsedObj.freeHeap = parsedObj.heap;
            }
            jsonData = parsedObj;
            isJson = true;
          }
        } catch {
          // ignore
        }
      }

      return res.status(response.status).json({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs,
        isJson,
        data: jsonData,
        rawText,
        contentType,
        targetUrl
      });

    } catch (err: any) {
      const isAbort = err.name === 'AbortError' || err.code === 'ABORT_ERR';
      return res.status(isAbort ? 504 : 502).json({
        ok: false,
        status: isAbort ? 504 : 502,
        error: isAbort ? `Request timeout after ${timeoutMs}ms` : (err.message || 'Network request failed'),
        code: isAbort ? 'ETIMEDOUT' : (err.code || 'ECONNFAILED'),
        targetUrl
      });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BrewPiLess Monitor server listening on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
