export interface ReportLimits {
  version: number;
  kinds: string[];
  attachmentTypes: string[];
  maxBodyChars: number;
  maxTextChars: number;
  maxAttachments: number;
  maxAttachmentChars: number;
  perIpHour: number;
  perIpDay: number;
  globalDay: number;
  dedupeWindowMs: number;
  retentionDays: number;
  maxListLimit: number;
}
export interface NormalizedReport {
  version: number;
  kind: string;
  build: string | null;
  clientId: string;
  sessionId: string | null;
  summary: { errors?: number; warnings?: number; floor?: number; hero?: string; seed?: number; abnormalPrev?: boolean };
  text: string;
  attachments: Array<{ name: string; type: string; data: string }>;
  size: number;
}
export interface ReportRepo {
  countByIp(ipHash: string, since: number): Promise<number>;
  countAll(since: number): Promise<number>;
  findDuplicate(clientId: string, textHash: string, since: number): Promise<boolean>;
  insert(row: NormalizedReport & { ipHash: string; textHash: string; createdAt: number }): Promise<number>;
}
export const REPORT_LIMITS: ReportLimits;
export function validateReport(body: unknown, limits?: ReportLimits): { ok: true; report: NormalizedReport } | { ok: false; reason: string };
export function decideQuota(counts: { ipHour: number; ipDay: number; globalDay: number }, limits?: ReportLimits): { status: number; reason: string; retryAfterS: number } | null;
export function sha256Hex(text: string): Promise<string>;
export function processReport(args: { body: unknown; ipHash: string; now: number; repo: ReportRepo; limits?: ReportLimits }): Promise<{ status: number; body: Record<string, unknown>; headers?: Record<string, string> }>;
export function retentionCutoff(now: number, limits?: ReportLimits): number;
export function tokensEqual(a: unknown, b: unknown): Promise<boolean>;
