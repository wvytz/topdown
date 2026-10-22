declare const worker: {
  fetch(request: Request, env: Record<string, unknown>): Promise<Response>;
  scheduled(event: unknown, env: Record<string, unknown>): Promise<void>;
};
export default worker;
export function validate(body: unknown, now: number): { score: number; floor: number; timestamp: number; name: string | null; hero: string | null } | null;
