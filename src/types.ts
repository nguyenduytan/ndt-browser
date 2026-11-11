import type * as PW from 'playwright-core';
import type * as PP from 'puppeteer-core';

export type Driver = 'puppeteer' | 'playwright';
export interface DriverTypes {
  puppeteer: { browser: PP.Browser; context: PP.BrowserContext; page: PP.Page };
  playwright: { browser: PW.Browser; context: PW.BrowserContext; page: PW.Page };
}
export type ResourceType = 'image' | 'media' | 'font' | 'stylesheet';
export interface Fingerprint {
  viewport?: { width: number; height: number; deviceScaleFactor?: number; isMobile?: boolean };
  locale?: string;
  timezone?: string;
  userAgent?: string;
  userAgentMetadata?: PP.Protocol.Emulation.UserAgentMetadata;
}
export interface ProxyOptions { server: string; username?: string; password?: string }
export interface BrowserOptions<D extends Driver = Driver> {
  driver?: D;
  executablePath?: string;
  /** Borrow a Chromium browser over CDP; close() only disposes our context. */
  endpoint?: string;
  /** CDP handshake headers, never applied to website requests. */
  connectHeaders?: Record<string, string>;
  userDataDir?: string;
  headless?: boolean;
  args?: string[];
  timeout?: number;
  /** Suppress Chromium's AutomationControlled flag. Not a fingerprint patch suite. */
  reduceAutomationSignals?: boolean;
  fingerprint?: Fingerprint;
  proxy?: ProxyOptions | string;
  humanize?: boolean;
  blockResources?: ResourceType[];
  headers?: Record<string, string>;
}
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  json?: unknown;
  body?: string;
  timeout?: number;
  maxBytes?: number;
  credentials?: RequestCredentials;
}
export interface BrowserResponse {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  json<T = unknown>(): T;
}
export type ExtractionSchema = Record<string, string | {
  selector: string;
  attribute?: string;
  multiple?: boolean;
  required?: boolean;
}>;
export type ExtractedData = Record<string, string | null | (string | null)[]>;
export interface NetworkStats {
  requests: number;
  blocked: number;
  /** CDP encoded transfer bytes, not a proxy billing measurement. */
  transferredBytes: number;
}
