import type { Page } from 'playwright-core';
import { httpUrl, positive } from './config.js';
import type { BrowserResponse, ExtractedData, ExtractionSchema, RequestOptions } from './types.js';

// Both drivers expose the same evaluate(function, serializableArgument) contract.
export type EvaluationPage = Pick<Page, 'evaluate'>;

export async function request(page: EvaluationPage, url: string, options: RequestOptions = {}): Promise<BrowserResponse> {
  httpUrl(url);
  const timeout = options.timeout ?? 30_000;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  positive(timeout, 'timeout'); positive(maxBytes, 'maxBytes');
  const method = (options.method ?? 'GET').toUpperCase();
  if (options.json !== undefined && options.body !== undefined) throw new TypeError('Use json or body, not both');
  if (['GET', 'HEAD'].includes(method) && (options.json !== undefined || options.body !== undefined))
    throw new TypeError('GET/HEAD requests cannot have a body');
  const headers = new Headers(options.headers);
  if (options.json !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const body = options.json !== undefined ? JSON.stringify(options.json) : options.body;
  const result = await page.evaluate(async input => {
    if (!['http:', 'https:'].includes(location.protocol))
      throw new Error('Navigate the page to the API origin before calling request; browser CORS rules apply');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeout);
    try {
      const response = await fetch(input.url, {
        method: input.method, headers: input.headers, body: input.body,
        credentials: input.credentials, signal: controller.signal,
      });
      if (response.type === 'opaque') throw new Error('Opaque responses cannot be read');
      const reader = response.body?.getReader();
      let bytes = 0;
      let text = '';
      const decoder = new TextDecoder();
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > input.maxBytes) {
              controller.abort();
              throw new Error(`Response exceeds maxBytes limit (${input.maxBytes})`);
            }
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } finally { reader.releaseLock(); }
      }
      return { url: response.url, status: response.status, ok: response.ok,
        headers: Object.fromEntries(response.headers), body: text };
    } finally { clearTimeout(timer); }
  }, { url, method, headers: Object.fromEntries(headers), body, timeout, maxBytes,
    credentials: options.credentials ?? 'same-origin' });
  return { ...result, json: <T>() => JSON.parse(result.body) as T };
}

export async function extract(page: EvaluationPage, schema: ExtractionSchema): Promise<ExtractedData> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new TypeError('Extraction schema must be an object');
  for (const [name, value] of Object.entries(schema)) {
    const field = typeof value === 'string' ? { selector: value } : value;
    if (!field || typeof field.selector !== 'string' || !field.selector.trim()) throw new TypeError(`Invalid selector for field ${name}`);
  }
  return page.evaluate(fields => Object.fromEntries(Object.entries(fields).map(([name, value]) => {
    const field = typeof value === 'string' ? { selector: value } : value;
    const nodes = [...document.querySelectorAll(field.selector)];
    const values = nodes.map(node => field.attribute ? node.getAttribute(field.attribute) : (node.textContent ?? '').trim());
    if (field.required && (values.length === 0 || values.some(value => value === null)))
      throw new Error(`Required extraction field missing: ${name}`);
    return [name, field.multiple ? values : values[0] ?? null];
  })), schema);
}
