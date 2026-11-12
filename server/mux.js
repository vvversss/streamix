import { createHmac, timingSafeEqual } from 'node:crypto';

export const ingestUrl = 'rtmps://global-live.mux.com:443/app';

export function verifyMuxSignature(body, header, secret, now = Date.now()) {
  if (!Buffer.isBuffer(body) || typeof header !== 'string') return false;
  const parts = header.split(',').map(part => part.trim().split('='));
  const timestamps = parts.filter(([name]) => name === 't');
  const timestamp = timestamps[0]?.[1];
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamp ?? '')) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(timestamp + '.').update(body).digest();
  return parts.some(([name, signature]) => name === 'v1' &&
    /^[a-f0-9]{64}$/i.test(signature ?? '') &&
    timingSafeEqual(expected, Buffer.from(signature, 'hex')));
}

export function muxClient(tokenId, tokenSecret) {
  const authorization = 'Basic ' + Buffer.from(tokenId + ':' + tokenSecret).toString('base64');
  return async (path, { method = 'GET', body } = {}) => {
    const response = await fetch('https://api.mux.com/video/v1/live-streams' + path, {
      method,
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      const error = new Error('Mux API HTTP ' + response.status);
      error.muxStatus = response.status;
      throw error;
    }
    return response.status === 204 ? null : (await response.json()).data;
  };
}
