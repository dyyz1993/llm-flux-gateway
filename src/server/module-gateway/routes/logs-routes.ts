import { Hono } from 'hono';
import { queryFirst } from '@server/shared/database';
import { requestLogService } from '../services/request-log.service';
import { protocolTranspiler } from '../../module-protocol-transpiler/protocol-transpiler-singleton';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const router = new Hono();

/**
 * GET /api/logs
 *
 * Get all request logs (with optional filters)
 */
router.get('/', async (c) => {
  const apiKeyId = c.req.query('apiKeyId');
  const limit = parseInt(c.req.query('limit') || '20');

  // If apiKeyId is provided, get logs for that key
  if (apiKeyId) {
    const logs = await requestLogService.getLogsByApiKey(apiKeyId, limit);
    return c.json({
      success: true,
      data: logs,
    });
  }

  // If no apiKeyId, redirect to /all endpoint
  const offset = parseInt(c.req.query('offset') || '0');
  const allLogs = await requestLogService.getAllLogs(limit, offset);
  return c.json({
    success: true,
    data: allLogs,
  });
});

/**
 * GET /api/logs/all
 *
 * Get all logs (not filtered by API key), with pagination
 */
router.get('/all', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    const logs = await requestLogService.getAllLogs(limit, offset);
    return c.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to get all logs',
    }, 500);
  }
});

/**
 * GET /api/logs/favorites
 *
 * Get all favorited logs
 * IMPORTANT: This route must be defined BEFORE /:id to avoid "favorites" being treated as an ID
 */
router.get('/favorites', async (c) => {
  const limit = parseInt(c.req.query('limit') || '100');

  try {
    const logs = await requestLogService.getFavoriteLogs(limit);
    return c.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to get favorite logs',
    }, 500);
  }
});

/**
 * GET /api/logs/stats
 *
 * Get logs statistics
 * IMPORTANT: This route must be defined BEFORE /:id to avoid "stats" being treated as an ID
 */
router.get('/stats', async (c) => {
  try {
    const stats = await requestLogService.getStats();
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to get stats',
    }, 500);
  }
});

/**
 * DELETE /api/logs/clear-all
 *
 * Clear all non-favorited logs
 * This is useful for freeing up space while keeping favorited logs
 * IMPORTANT: This route must be defined BEFORE /:id to avoid "clear-all" being treated as an ID
 */
router.delete('/clear-all', async (c) => {
  try {
    const result = await requestLogService.clearAllNonFavorited();
    return c.json({
      success: true,
      data: result,
      message: `Cleared ${result.deletedCount} non-favorited logs`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to clear logs',
    }, 500);
  }
});

/**
 * POST /api/logs/:id/retry
 *
 * Retry a specific request by its log ID
 * This will 100% reconstruct the original request and re-run it through the gateway
 */
router.post('/:id/retry', async (c) => {
  const id = c.req.param('id');
  const log = await requestLogService.getLogById(id);

  if (!log) {
    return c.json({
      success: false,
      error: 'Log not found',
    }, 404);
  }

  const originalFormat = log.originalRequestFormat || 'openai';

  // Reconstruct original request body
  let reconstructedBody: any;
  
  // Priority 1: Use the 100% raw body if available
  if (log.originalRequestRaw) {
    try {
      reconstructedBody = JSON.parse(log.originalRequestRaw);
      console.log('[Logs] Using original_request_raw for 100% reconstruction');
    } catch (e) {
      console.warn('[Logs] Failed to parse original_request_raw, falling back to reconstruction');
    }
  }

  // Priority 2: Reconstruct from components (fallback for older logs)
  if (!reconstructedBody) {
    // 1. Reconstruct internal request format (camelCase)
    const internalRequest = {
      model: log.originalModel,
      messages: log.messages,
      tools: log.requestTools,
      temperature: log.temperature,
      ...(log.requestParams || {}),
    };

    // 2. Convert internal request back to original source format
    reconstructedBody = internalRequest;
    const converter = protocolTranspiler.getConverter(originalFormat);
    if (converter && typeof converter.convertRequestFromInternal === 'function') {
      const result = converter.convertRequestFromInternal(internalRequest as any);
      if (result.success) {
        reconstructedBody = result.data;
      }
    }
  }

  console.log('[Logs] Retrying request from log:', id, {
    model: log.originalModel,
    apiKeyId: log.apiKeyId,
    path: log.path,
    originalFormat,
    stream: reconstructedBody.stream,
  });

  // Trigger background request using a real HTTP fetch to the local gateway
  // This ensures it goes through the full middleware stack and doesn't rely on mock contexts
  (async () => {
    try {
      const port = process.env.PORT || 3000;
      const localUrl = `http://localhost:${port}${log.path}`;
      
      // Get an API key token to use for the request
      // We'll use the one associated with the log if possible, 
      // otherwise this request might fail auth middleware
      const apiKey = queryFirst<{ key_token: string }>(
        'SELECT key_token FROM api_keys WHERE id = ?', 
        [log.apiKeyId]
      );

      if (!apiKey) {
        console.error('[Logs] Cannot retry: API Key not found for log', log.id);
        return;
      }

      console.log('[Logs] Dispatching real HTTP retry to:', localUrl);

      const response = await fetch(localUrl, {
        method: log.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.key_token}`,
          ...(log.originalRequestFormat && log.originalRequestFormat !== 'openai' 
              ? { 'X-Request-Format': log.originalRequestFormat } 
              : {})
        },
        body: JSON.stringify(reconstructedBody)
      });

      console.log('[Logs] Real HTTP retry dispatched, response status:', response.status);
    } catch (error) {
      console.error('[Logs] Real HTTP retry dispatch failed:', error);
    }
  })();

  return c.json({
    success: true,
    message: 'Retry initiated via HTTP',
  });
});

/**
 * GET /api/logs/:id
 *
 * Get a specific request log by ID
 */
router.get('/:id', async (c) => {
  const id = c.req.param('id');
  const log = await requestLogService.getLogById(id);

  if (!log) {
    return c.json({
      success: false,
      error: 'Log not found',
    }, 404);
  }

  return c.json({
    success: true,
    data: log,
  });
});

/**
 * POST /api/logs/:id/favorite
 *
 * Toggle favorite status of a log
 */
router.post('/:id/favorite', async (c) => {
  const id = c.req.param('id');

  try {
    const result = await requestLogService.toggleFavorite(id);
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to toggle favorite',
    }, 404);
  }
});

/**
 * GET /api/logs/:id/protocol-log
 *
 * Get protocol transformation log for a specific request
 * Returns the full protocol transformation log file content
 */
router.get('/:id/protocol-log', async (c) => {
  const requestId = c.req.param('id');

  try {
    const logDir = join(process.cwd(), 'logs', 'protocol-transformation');

    // Check if log directory exists
    if (!existsSync(logDir)) {
      return c.json({
        success: false,
        error: 'Protocol transformation log directory not found',
      }, 404);
    }

    // Read all log files in the directory
    const files = await readdir(logDir);

    // Find log file that matches the request ID
    // Log file format: {requestId}-{shortId}-{timestamp}.log
    // requestId is a UUID (5 parts separated by dashes)
    const matchingFile = files.find(file => {
      // Remove .log extension
      const nameWithoutExt = file.replace(/\.log$/, '');
      // Split by dash and rejoin first 5 parts (UUID format)
      const parts = nameWithoutExt.split('-');
      if (parts.length >= 5) {
        const fileRequestId = parts.slice(0, 5).join('-');
        return fileRequestId === requestId;
      }
      return false;
    });

    if (!matchingFile) {
      return c.json({
        success: false,
        error: `Protocol transformation log not found for request: ${requestId}`,
      }, 404);
    }

    // Read the log file content
    const logPath = join(logDir, matchingFile);
    const logContent = await readFile(logPath, 'utf-8');

    return c.json({
      success: true,
      data: {
        requestId,
        fileName: matchingFile,
        content: logContent,
        size: logContent.length,
      },
    });
  } catch (error: any) {
    console.error('[Logs Routes] Failed to read protocol log:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to read protocol transformation log',
    }, 500);
  }
});

export default router;
