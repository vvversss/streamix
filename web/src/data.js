import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;
export const streamFields = '*, owner:profiles!streams_owner_id_fkey(id, username, avatar_url, bio)';

export async function unwrap(operation) {
  const { data, error } = await operation;
  if (error) throw error;
  return data;
}

export function errorText(error) {
  if (error.code === '23505') return 'Это имя пользователя уже занято.';
  if (error.message === 'Invalid login credentials') return 'Неверный email или пароль.';
  if (error.message === 'Email not confirmed') return 'Подтвердите email по ссылке из письма.';
  return error.message || 'Не удалось выполнить запрос.';
}

export async function api(path, options = {}) {
  const { session } = await unwrap(db.auth.getSession());
  if (!session) throw new Error('Войдите в аккаунт');
  const response = await fetch('/api' + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + session.access_token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? 'Ошибка API (' + response.status + ')');
  return data;
}

export function useQuery(load, table, filter) {
  const [state, setState] = useState({ data: null, error: '', ready: false });
  useEffect(() => {
    let active = true;
    let running = false;
    let pending = false;
    async function refresh() {
      if (!active) return;
      if (running) {
        pending = true;
        return;
      }
      running = true;
      try {
        const data = await load();
        if (active) setState({ data, error: '', ready: true });
      } catch (error) {
        if (active) setState(previous => ({ ...previous, error: errorText(error), ready: true }));
      } finally {
        running = false;
        if (pending) {
          pending = false;
          void refresh();
        }
      }
    }
    setState({ data: null, error: '', ready: false });
    void refresh();
    let channel;
    let interval;
    if (table) {
      channel = db.channel(table + ':' + crypto.randomUUID())
        .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, refresh)
        .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
      interval = setInterval(refresh, 30000);
    }
    return () => {
      active = false;
      clearInterval(interval);
      if (channel) void db.removeChannel(channel);
    };
  }, [load, table, filter]);
  return state;
}
