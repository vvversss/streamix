import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Box, Clapperboard, Copy, Crosshair, Eye, EyeOff, Gamepad2, Heart, House,
  LayoutGrid, LogOut, MapPin, MessageCircle, Music2, Play, Radio, Search, Send, Shapes, Trash2, UserRound, Zap } from 'lucide-react';
import '@fontsource-variable/inter';
import { api, db, errorText, streamFields, unwrap, useQuery } from './data.js';
import { categories, categoryName } from './categories.js';
import './style.css';

const icons = { Box, Crosshair, Gamepad2, MapPin, MessageCircle, Music2, Shapes, Zap };
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function Logo() {
  return <Link className="logo" to="/"><span className="logo-mark"><Play size={18} fill="currentColor" /></span><span>STREAM<span>IX</span></span></Link>;
}

function Avatar({ profile }) {
  return <span className="avatar" aria-hidden="true">
    {(profile?.username?.[0] ?? '?').toUpperCase()}
    {profile?.avatar_url && <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
  </span>;
}

function Live() {
  return <span className="live"><i /> LIVE</span>;
}

function Notice({ children }) {
  return children ? <p className="notice" role="alert">{children}</p> : null;
}

function Frame({ session, children }) {
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  async function signOut() {
    try {
      await unwrap(db.auth.signOut());
      navigate('/');
    } catch (failure) {
      setError(errorText(failure));
    }
  }
  return <>
    <header className="top">
      <Logo />
      <form className="search" role="search" onSubmit={event => {
        event.preventDefault();
        navigate('/search?q=' + encodeURIComponent(search.trim()));
      }}>
        <Search size={18} /><input aria-label="Поиск" value={search} maxLength={100}
          onChange={event => setSearch(event.target.value)} placeholder="Поиск трансляций и каналов" />
        <button aria-label="Найти" title="Найти"><ArrowRight size={16} /></button>
      </form>
      <div className="top-actions">
        {session ? <>
          <Link to="/settings" className="icon-button" title="Мой профиль" aria-label="Мой профиль"><UserRound size={19} /></Link>
          <button onClick={signOut} className="icon-button" title="Выйти" aria-label="Выйти"><LogOut size={19} /></button>
        </> : <Link className="button primary" to="/login">Войти</Link>}
      </div>
    </header>
    <div className="layout">
      <aside className="sidebar">
        <nav aria-label="Разделы">
          <NavLink end to="/"><House size={19} /><span>Главная</span></NavLink>
          <NavLink to="/categories"><LayoutGrid size={19} /><span>Категории</span></NavLink>
          <NavLink to="/following"><Heart size={19} /><span>Подписки</span></NavLink>
          <NavLink to="/studio"><Radio size={19} /><span>Студия</span></NavLink>
        </nav>
      </aside>
      <main className="content"><Notice>{error}</Notice>{children}</main>
    </div>
  </>;
}

function CategoryTiles() {
  return <div className="categories">{categories.map(category => {
    const Icon = icons[category.icon];
    return <Link to={'/categories/' + category.id} className="category" key={category.id} style={{ '--accent': category.color }}>
      <span className="category-art"><Icon size={32} strokeWidth={1.4} /></span><strong>{category.name}</strong>
    </Link>;
  })}</div>;
}

function StreamCard({ stream }) {
  return <article className="stream-card">
    <Link className="thumbnail" to={'/channel/' + stream.owner_id}>
      <Radio size={40} />
      <img src={'https://image.mux.com/' + encodeURIComponent(stream.playback_id) + '/thumbnail.jpg?latest=true&width=640&height=360&fit_mode=crop'}
        alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} />
      <Live /><span className="thumbnail-play"><Play size={21} fill="currentColor" /></span>
    </Link>
    <div className="stream-caption"><Avatar profile={stream.owner} /><div>
      <Link className="stream-title" to={'/channel/' + stream.owner_id}>{stream.title}</Link>
      <Link className="muted" to={'/channel/' + stream.owner_id}>@{stream.owner?.username}</Link>
      <Link className="pill" to={'/categories/' + stream.category}>{categoryName(stream.category)}</Link>
    </div></div>
  </article>;
}

function StreamGrid({ streams, ready, error, empty = 'Сейчас здесь нет прямых эфиров.' }) {
  return <>
    <Notice>{error}</Notice>
    {!ready && <p className="muted">Загрузка эфиров…</p>}
    {ready && !error && !streams?.length && <div className="empty"><Radio size={24} /><p>{empty}</p></div>}
    {Boolean(streams?.length) && <div className="stream-grid">{streams.map(stream => <StreamCard stream={stream} key={stream.id} />)}</div>}
  </>;
}

function Browse({ category }) {
  const load = useCallback(() => {
    let query = db.from('streams').select(streamFields).eq('is_live', true).order('started_at', { ascending: false }).limit(60);
    if (category) query = query.eq('category', category);
    return unwrap(query);
  }, [category]);
  const result = useQuery(load, 'streams');
  return <StreamGrid {...result} streams={result.data} />;
}

function Home() {
  return <>
    <section className="hero">
      <div className="hero-decoration" aria-hidden="true"><Radio size={160} strokeWidth={0.85} /></div>
      <div className="hero-content"><h1>Прямые эфиры<span>.</span></h1>
        <p>Игры, музыка и общение. Смотри эфиры и общайся в чате или запусти свой стрим через OBS.</p>
        <div className="actions"><a className="button primary" href="#live"><Play size={16} fill="currentColor" /> Смотреть эфиры</a>
          <Link className="button glass" to="/studio"><Radio size={17} /> Открыть студию</Link></div>
      </div>
    </section>
    <section id="live"><h2><span className="status-dot" /> Сейчас в эфире</h2><Browse /></section>
    <section><h2>Категории</h2><CategoryTiles /></section>
  </>;
}

function Categories() {
  const { category } = useParams();
  return category ? <>
    <Link to="/categories" className="back"><ArrowLeft size={16} /> Все категории</Link>
    <h1>{categoryName(category)}</h1>
    {categories.some(item => item.id === category) ? <Browse category={category} /> : <p>Категория не найдена.</p>}
  </> : <><h1>Категории</h1><CategoryTiles /></>;
}

function ProfileGrid({ profiles }) {
  return <div className="profile-grid">{profiles.map(profile => <Link className="panel profile-card"
    to={'/channel/' + profile.id} key={profile.id}><Avatar profile={profile} /><div><strong>@{profile.username}</strong>
    {profile.bio && <p className="muted">{profile.bio}</p>}</div><ArrowRight size={17} /></Link>)}</div>;
}

function SearchPage() {
  const [params] = useSearchParams();
  const term = (params.get('q') ?? '').trim().slice(0, 100);
  const load = useCallback(async () => {
    if (!term) return { profiles: [], streams: [] };
    const pattern = '%' + term.replace(/[\\%_]/g, '\\$&') + '%';
    const [profiles, streams] = await Promise.all([
      unwrap(db.from('profiles').select('*').ilike('username', pattern).order('username').limit(30)),
      unwrap(db.from('streams').select(streamFields).eq('is_live', true).ilike('title', pattern)
        .order('started_at', { ascending: false }).limit(30))
    ]);
    return { profiles, streams };
  }, [term]);
  const { data, error, ready } = useQuery(load, 'streams');
  return <><h1>Поиск</h1>
    {!term ? <p className="muted">Введите имя пользователя или название эфира в строке поиска.</p> : <>
      <p className="muted">Результаты по запросу «{term}»</p>
      <Notice>{error}</Notice>
      {!ready && <p className="muted">Поиск…</p>}
      {data && <><h2>Каналы</h2>{data.profiles.length ? <ProfileGrid profiles={data.profiles} /> : <p className="muted">Каналы не найдены.</p>}
        <h2>Трансляции</h2><StreamGrid streams={data.streams} ready empty="Эфиры с таким названием не найдены." /></>}
    </>}
  </>;
}

function SignInRequired() {
  return <div className="panel auth-panel"><h2>Войдите в аккаунт</h2><Link className="button primary" to="/login">Войти или зарегистрироваться</Link></div>;
}

function Following({ userId }) {
  const load = useCallback(() => unwrap(db.from('follows').select('channel:profiles!follows_channel_id_fkey(*)')
    .eq('follower_id', userId).order('channel_id')), [userId]);
  const { data, error, ready } = useQuery(load);
  return <><h1>Подписки</h1><Notice>{error}</Notice>
    {!ready && <p className="muted">Загрузка…</p>}
    {data?.length ? <ProfileGrid profiles={data.map(item => item.channel)} /> :
      ready && !error && <p className="muted">Подпишитесь на канал, чтобы он появился в этом списке.</p>}
  </>;
}

function Auth({ session }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  useEffect(() => { if (session) navigate(register ? '/settings' : '/', { replace: true }); }, [session, navigate, register]);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = { email: form.get('email'), password: form.get('password') };
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (register) {
        const data = await unwrap(db.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + '/settings' } }));
        if (!data.session) setMessage('Проверьте почту и подтвердите адрес по ссылке из письма.');
      } else await unwrap(db.auth.signInWithPassword(credentials));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel auth-panel"><h1>{register ? 'Регистрация' : 'Вход в STREAMIX'}</h1>
    <form className="stack" onSubmit={submit}>
      <label>Email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Пароль<input name="password" type="password" minLength={register ? 8 : undefined} required
        autoComplete={register ? 'new-password' : 'current-password'} /></label>
      <Notice>{error}</Notice>{message && <p role="status">{message}</p>}
      <button className="button primary" disabled={busy}>{register ? 'Создать аккаунт' : 'Войти'}</button>
    </form>
    <button className="text-button" onClick={() => { setRegister(!register); setError(''); setMessage(''); }}>
      {register ? 'У меня уже есть аккаунт' : 'Создать аккаунт'}
    </button>
  </section>;
}

function Settings({ userId }) {
  const load = useCallback(() => unwrap(db.from('profiles').select('*').eq('id', userId).single()), [userId]);
  const { data, error, ready } = useQuery(load);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.username = values.username.trim().toLowerCase();
    values.avatar_url = values.avatar_url.trim();
    values.bio = values.bio.trim();
    setBusy(true);
    try {
      await unwrap(db.from('profiles').update(values).eq('id', userId).select('id').single());
      setFeedback('Профиль сохранён.');
    } catch (failure) {
      setFeedback(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  return <><h1>Мой профиль</h1><Notice>{error}</Notice>
    {!ready && <p className="muted">Загрузка профиля…</p>}
    {data && <form className="stack panel editor" onSubmit={save}>
      <label>Имя пользователя<input name="username" defaultValue={data.username} required pattern="[a-zA-Z0-9_]{3,24}" maxLength={24}
        title="3–24 символа: латиница, цифры или подчёркивание" /></label>
      <label>HTTPS-ссылка на аватар<input name="avatar_url" type="url" pattern="https://.+" defaultValue={data.avatar_url} maxLength={500} /></label>
      <label>О себе<textarea name="bio" defaultValue={data.bio} maxLength={300} rows={4} /></label>
      <div className="actions"><button className="button primary" disabled={busy}>Сохранить</button>
        <Link to={'/channel/' + userId} className="button">Открыть канал</Link></div>
      {feedback && <p role="status">{feedback}</p>}
    </form>}
  </>;
}

function Studio({ userId }) {
  const load = useCallback(() => api('/studio'), []);
  const result = useQuery(load);
  const [saved, setSaved] = useState(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const details = saved ?? result.data;
  const statusLoad = useCallback(() => unwrap(db.from('streams').select('is_live').eq('owner_id', userId).maybeSingle()), [userId]);
  const status = useQuery(statusLoad, 'streams', 'owner_id=eq.' + userId);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    try {
      const body = JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)));
      setSaved(await api('/studio', { method: 'PUT', body }));
      setFeedback('Настройки эфира сохранены.');
    } catch (failure) {
      setFeedback(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(label + ' скопирован.');
    } catch {
      setFeedback('Копирование недоступно. Выделите значение и скопируйте вручную.');
    }
  }
  return <><h1>Студия</h1><Notice>{result.error}</Notice>
    {!result.ready && <p className="muted">Загрузка студии…</p>}
    {details && <div className="studio-grid">
      <form className="panel stack" onSubmit={save}>
        <h2>Настройки эфира</h2>
        <label>Название<input name="title" defaultValue={details.stream?.title} required maxLength={100} /></label>
        <label>Категория<select name="category" defaultValue={details.stream?.category ?? 'chat'}>
          {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <button className="button primary" disabled={busy}>{details.stream ? 'Сохранить' : 'Создать трансляцию'}</button>
        {feedback && <p role="status">{feedback}</p>}
      </form>
      <section className="panel stack">
        <div className="section-line"><h2>Подключение OBS</h2>{(status.data?.is_live ?? details.stream?.is_live) && <Live />}</div>
        {details.stream ? <>
          <label>Сервер RTMPS<span className="field-row"><input readOnly value={details.server} />
            <button className="icon-button" onClick={() => copy(details.server, 'Адрес')} aria-label="Скопировать адрес"><Copy size={18} /></button></span></label>
          <label>Ключ трансляции<span className="field-row"><input readOnly type={visible ? 'text' : 'password'} value={details.key} />
            <button className="icon-button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Скрыть ключ' : 'Показать ключ'}>
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            <button className="icon-button" onClick={() => copy(details.key, 'Ключ')} aria-label="Скопировать ключ"><Copy size={18} /></button></span></label>
          <p className="muted">В OBS откройте «Настройки → Трансляция → Пользовательский» и вставьте оба значения.</p>
          <Link to={'/channel/' + userId} className="button">Открыть канал</Link>
        </> : <p className="muted">Создайте трансляцию, чтобы получить сервер и персональный ключ.</p>}
      </section>
    </div>}
  </>;
}

function Player({ playbackId }) {
  const video = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    const element = video.current;
    const source = 'https://stream.mux.com/' + encodeURIComponent(playbackId) + '.m3u8';
    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      const onError = () => setError('Не удалось загрузить видео.');
      element.addEventListener('error', onError);
      element.src = source;
      return () => { element.removeEventListener('error', onError); element.removeAttribute('src'); element.load(); };
    }
    let active = true;
    let hls;
    import('hls.js').then(({ default: Hls }) => {
      if (!active) return;
      if (!Hls.isSupported()) {
        setError('Этот браузер не поддерживает воспроизведение HLS.');
        return;
      }
      hls = new Hls({ lowLatencyMode: true });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError('Поток прерван. Перезагрузите страницу, чтобы подключиться снова.');
      });
      hls.attachMedia(element);
      hls.loadSource(source);
    }).catch(() => { if (active) setError('Не удалось загрузить плеер.'); });
    return () => { active = false; hls?.destroy(); };
  }, [playbackId]);
  return <div className="video-frame"><video ref={video} controls playsInline autoPlay muted aria-label="Прямой эфир" /><Notice>{error}</Notice></div>;
}

function Chat({ streamId, session, isOwner }) {
  const [body, setBody] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef(null);
  const load = useCallback(async () => {
    const data = await unwrap(db.from('chat_messages').select('*').eq('stream_id', streamId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(60));
    return data.reverse();
  }, [streamId]);
  const { data, error, ready } = useQuery(load, 'chat_messages', 'stream_id=eq.' + streamId);
  const last = data?.at(-1)?.id;
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [last]);

  async function send(event) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setFeedback('');
    try {
      await unwrap(db.from('chat_messages').insert({ stream_id: streamId, body: body.trim() }));
      setBody('');
    } catch (failure) {
      setFeedback(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  async function remove(messageId) {
    setFeedback('');
    try {
      await api('/studio/chat/' + messageId, { method: 'DELETE' });
    } catch (failure) {
      setFeedback(errorText(failure));
    }
  }
  return <section className="chat panel">
    <h2><MessageCircle size={19} /> Чат эфира</h2>
    <div className="messages" ref={list} aria-live="polite">
      <Notice>{error}</Notice>
      {!ready && <p className="muted">Загрузка чата…</p>}
      {ready && !error && !data?.length && <p className="muted">Сообщений пока нет.</p>}
      {data?.map(message => <div className="message" key={message.id}>
        <div><strong>{message.username}</strong> {message.removed ?
          <em className="muted">сообщение удалено</em> : <span>{message.body}</span>}</div>
        {isOwner && !message.removed && <button className="icon-button" onClick={() => remove(message.id)} aria-label="Удалить сообщение"><Trash2 size={15} /></button>}
      </div>)}
    </div>
    <Notice>{feedback}</Notice>
    {session ? <form className="chat-form" onSubmit={send}>
      <input value={body} onChange={event => setBody(event.target.value)} maxLength={300} required
        aria-label="Сообщение" placeholder="Написать сообщение" />
      <button className="button primary" disabled={busy || !body.trim()} aria-label="Отправить"><Send size={17} /></button>
    </form> : <p className="chat-login"><Link to="/login">Войдите</Link>, чтобы писать в чате.</p>}
  </section>;
}

function FollowButton({ userId, channelId }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState(null);
  const load = useCallback(() => unwrap(db.from('follows').select('channel_id').eq('follower_id', userId)
    .eq('channel_id', channelId).maybeSingle()), [userId, channelId]);
  const state = useQuery(load);
  const following = override ?? Boolean(state.data);
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      if (following) await unwrap(db.from('follows').delete().eq('follower_id', userId).eq('channel_id', channelId));
      else await unwrap(db.from('follows').insert({ channel_id: channelId }));
      setOverride(!following);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  return <div><button className="button" onClick={toggle} disabled={busy || !state.ready || Boolean(state.error)}>
    <Heart size={17} fill={following ? 'currentColor' : 'none'} /> {following ? 'Отписаться' : 'Подписаться'}</button>
    <Notice>{error || state.error}</Notice></div>;
}

function Channel({ session }) {
  const { id } = useParams();
  const load = useCallback(async () => {
    if (!uuid.test(id)) return null;
    const [profile, stream] = await Promise.all([
      unwrap(db.from('profiles').select('*').eq('id', id).maybeSingle()),
      unwrap(db.from('streams').select('*').eq('owner_id', id).maybeSingle())
    ]);
    return profile ? { profile, stream } : null;
  }, [id]);
  const { data, error, ready } = useQuery(load, 'streams', uuid.test(id) ? 'owner_id=eq.' + id : undefined);
  if (error) return <Notice>{error}</Notice>;
  if (!ready) return <p className="muted">Загрузка канала…</p>;
  if (!data) return <h1>Канал не найден</h1>;
  const { profile, stream } = data;
  return <div className={'watch' + (stream ? '' : ' no-chat')}>
    <section className="watch-main">
      {stream?.is_live ? <Player playbackId={stream.playback_id} /> :
        <div className="offline"><Radio size={42} /><p>Канал сейчас не в эфире</p></div>}
      <div className="panel channel-info">
        <div className="channel-head"><Avatar profile={profile} /><div>
          <h1>{stream?.title ?? '@' + profile.username}</h1>
          <span className="muted">@{profile.username}</span>
          {stream && <Link className="pill" to={'/categories/' + stream.category}>{categoryName(stream.category)}</Link>}
        </div>{stream?.is_live && <Live />}</div>
        {profile.bio && <p className="bio">{profile.bio}</p>}
        {session?.user.id === id ? <Link className="button" to="/studio"><Radio size={16} /> Студия</Link> :
          session ? <FollowButton key={session.user.id + id} userId={session.user.id} channelId={id} /> :
            <Link className="button" to="/login"><Heart size={16} /> Войти, чтобы подписаться</Link>}
      </div>
    </section>
    {stream && <Chat key={stream.id} streamId={stream.id} session={session} isOwner={session?.user.id === id} />}
  </div>;
}

function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!db) return undefined;
    const { data } = db.auth.onAuthStateChange((_event, value) => {
      setSession(value);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (!db) return <main className="setup panel"><Clapperboard /><h1>Настройка STREAMIX</h1>
    <p>Заполните файл web/.env по инструкции в README и перезапустите приложение.</p></main>;
  if (!ready) return <main className="setup"><Logo /><p className="muted">Загрузка…</p></main>;
  const userId = session?.user.id;
  return <Frame session={session}><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/categories/:category?" element={<Categories />} />
    <Route path="/search" element={<SearchPage />} />
    <Route path="/following" element={userId ? <Following key={userId} userId={userId} /> : <SignInRequired />} />
    <Route path="/studio" element={userId ? <Studio key={userId} userId={userId} /> : <SignInRequired />} />
    <Route path="/settings" element={userId ? <Settings key={userId} userId={userId} /> : <SignInRequired />} />
    <Route path="/login" element={<Auth session={session} />} />
    <Route path="/channel/:id" element={<Channel session={session} />} />
    <Route path="*" element={<><h1>Страница не найдена</h1><Link to="/">На главную</Link></>} />
  </Routes></Frame>;
}

createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);
