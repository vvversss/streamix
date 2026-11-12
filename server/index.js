import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { ingestUrl, muxClient, verifyMuxSignature } from './mux.js';
import { categories } from '../web/src/categories.js';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });
const config = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  APP_ORIGINS: z.string().min(1),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SUPABASE_URL: z.url({ protocol: /^https$/ }),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  MUX_TOKEN_ID: z.string().min(1),
  MUX_TOKEN_SECRET: z.string().min(1),
  MUX_WEBHOOK_SECRET: z.string().min(1)
}).safeParse(process.env);
if (!config.success) {
  console.error('Проверьте server/.env:', config.error.issues.map(issue => issue.path.join('.')).join(', '));
  process.exit(1);
}
const env = config.data;
const origins = new Set(env.APP_ORIGINS.split(',').map(origin => new URL(origin.trim()).origin));
const supabaseOrigin = new URL(env.SUPABASE_URL).origin;
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const mux = muxClient(env.MUX_TOKEN_ID, env.MUX_TOKEN_SECRET);
const app = express();
app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use(helmet({
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
  contentSecurityPolicy: { directives: {
    connectSrc: ["'self'", supabaseOrigin, supabaseOrigin.replace(/^https:/, 'wss:'), 'https://*.mux.com'],
    imgSrc: ["'self'", 'data:', 'https:'],
    mediaSrc: ["'self'", 'blob:', 'https://*.mux.com'],
    workerSrc: ["'self'", 'blob:'],
    upgradeInsecureRequests: null
  } }
}));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const liveEvents = new Set(['video.live_stream.active', 'video.live_stream.idle',
  'video.live_stream.disabled', 'video.live_stream.deleted']);
const eventSchema = z.object({
  type: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({ id: z.string().min(1).max(160) })
});

app.post('/api/webhooks/mux', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  if (!verifyMuxSignature(req.body, req.get('mux-signature'), env.MUX_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!liveEvents.has(body?.type)) return res.sendStatus(204);
  const event = eventSchema.safeParse(body);
  if (!event.success) return res.status(400).json({ error: 'Invalid Mux event' });
  const { data, created_at: eventAt } = event.data;
  const known = await query(db.from('stream_secrets').select('last_event_at').eq('mux_id', data.id).maybeSingle());
  if (!known || (known.last_event_at && Date.parse(known.last_event_at) > Date.parse(eventAt))) return res.sendStatus(204);

  let live = false;
  try {
    const remote = await mux('/' + encodeURIComponent(data.id));
    live = remote.status === 'active';
  } catch (error) {
    if (error.muxStatus !== 404) throw error;
  }
  await query(db.rpc('streamix_apply_live_event', { p_mux: data.id, p_live: live, p_event_at: eventAt }));
  return res.sendStatus(204);
});

app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && !origins.has(origin)) return res.status(403).json({ error: 'Запрос с этого сайта запрещён' });
  return next();
}, cors({ origin: [...origins] }), express.json({ limit: '16kb' }),
rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте через минуту.' } }));

async function query(operation) {
  const { data, error } = await operation;
  if (error) throw error;
  return data;
}

async function authenticate(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const token = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '')?.[1];
  if (!token) return res.status(401).json({ error: 'Войдите в аккаунт' });
  const { data, error } = await db.auth.getUser(token);
  if (error && (!error.status || error.status >= 500)) throw error;
  if (error || !data.user || data.user.is_anonymous) return res.status(401).json({ error: 'Сессия недействительна' });
  req.userId = data.user.id;
  return next();
}

const streamFields = 'id, title, category, is_live';
const streamBody = z.object({
  title: z.string().trim().min(1).max(100),
  category: z.enum(categories.map(category => category.id))
}).strict();

function findChannel(owner) {
  return query(db.from('streams').select(streamFields).eq('owner_id', owner).maybeSingle());
}

async function studioDetails(stream) {
  if (!stream) return { stream: null };
  const secret = await query(db.from('stream_secrets').select('stream_key').eq('stream_id', stream.id).single());
  return { stream, server: ingestUrl, key: secret.stream_key };
}

app.get('/api/studio', authenticate, async (req, res) => {
  res.json(await studioDetails(await findChannel(req.userId)));
});

app.put('/api/studio', authenticate,
  rateLimit({ windowMs: 60000, limit: 8, keyGenerator: req => req.userId,
    message: { error: 'Слишком много изменений. Попробуйте через минуту.' } }),
  async (req, res) => {
    const input = streamBody.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Укажите категорию и название до 100 символов' });
    const existing = await findChannel(req.userId);
    if (existing) {
      const stream = await query(db.from('streams').update(input.data).eq('id', existing.id).select(streamFields).single());
      return res.json(await studioDetails(stream));
    }
    const remote = await mux('', { method: 'POST', body: {
      playback_policies: ['public'],
      new_asset_settings: { playback_policies: [] },
      latency_mode: 'low',
      reconnect_window: 30,
      passthrough: req.userId
    } });
    try {
      const playbackId = remote.playback_ids?.find(item => item.policy === 'public')?.id;
      if (!remote.id || !remote.stream_key || !playbackId) throw new Error('Incomplete Mux live stream');
      await query(db.rpc('streamix_save_channel', {
        p_owner: req.userId, p_title: input.data.title, p_category: input.data.category,
        p_mux: remote.id, p_playback: playbackId, p_key: remote.stream_key
      }));
    } catch (error) {
      // Check whether the write committed before deleting the newly created Mux resource.
      const persisted = await query(db.from('stream_secrets').select('stream_id').eq('mux_id', remote.id).maybeSingle());
      if (!persisted) {
        try {
          if (remote.id) await mux('/' + encodeURIComponent(remote.id), { method: 'DELETE' });
        } catch (cleanupError) {
          console.error('Mux cleanup failed', remote.id, cleanupError.muxStatus);
        }
        if (error.code !== '23505') throw error;
      }
    }
    return res.json(await studioDetails(await findChannel(req.userId)));
  }
);

app.delete('/api/studio/chat/:messageId', authenticate, async (req, res) => {
  const id = z.uuid().safeParse(req.params.messageId);
  if (!id.success) return res.status(400).json({ error: 'Некорректный ID сообщения' });
  const channel = await findChannel(req.userId);
  if (!channel) return res.sendStatus(404);
  const removed = await query(db.from('chat_messages').update({ removed: true, body: '' })
    .eq('id', id.data).eq('stream_id', channel.id).select('id').maybeSingle());
  return res.sendStatus(removed ? 204 : 404);
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Маршрут не найден' }));
const dist = fileURLToPath(new URL('../web/dist/', import.meta.url));
const index = fileURLToPath(new URL('../web/dist/index.html', import.meta.url));
if (existsSync(index)) {
  app.use(express.static(dist));
  app.get('/{*path}', (req, res, next) => req.accepts('html') ? res.sendFile(index) : next());
}
app.use((error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный JSON' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Слишком большой запрос' });
  console.error('API error', error.code ?? error.name, error.muxStatus ?? '');
  return res.status(502).json({ error: 'Сервис временно недоступен. Проверьте настройки и журнал API.' });
});
app.listen(env.PORT, () => console.log('STREAMIX API: http://localhost:' + env.PORT));
