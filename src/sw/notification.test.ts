import {
  FALLBACK,
  openFromNotification,
  readPayload,
  toNotification,
  type WindowClients,
} from './notification';

describe('toNotification', () => {
  const payload = {
    v: 1,
    title: 'Karachi · 26° and sunny',
    body: 'High 29°C, low 24°C. 10% chance of rain.',
    url: '/?city=Karachi~~PK~24.8607~67.0011',
    tag: 'wb-daily',
  };

  it('shows the server’s text with our icon, a monochrome badge and a replacing tag', () => {
    expect(toNotification(payload)).toEqual({
      title: 'Karachi · 26° and sunny',
      options: {
        body: 'High 29°C, low 24°C. 10% chance of rain.',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: 'wb-daily',
        data: { url: '/?city=Karachi~~PK~24.8607~67.0011' },
      },
    });
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'hello'],
    ['a number', 42],
    ['an empty object', {}],
    ['a missing body', { title: 'Karachi' }],
    ['a missing title', { body: 'High 29°' }],
    ['a blank title', { title: '   ', body: 'High 29°' }],
    ['a title that is not text', { title: 26, body: 'High 29°' }],
  ])('falls back to a plain reminder for %s', (_label, value) => {
    expect(toNotification(value)).toEqual(FALLBACK);
  });

  it('the fallback is a complete notification that opens the app', () => {
    expect(FALLBACK.title).toBe('WeatherBoard');
    expect(FALLBACK.options.body.length).toBeGreaterThan(10);
    expect(FALLBACK.options.data.url).toBe('/');
    expect(FALLBACK.options.tag).toBe('wb-daily');
  });

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    'javascript:alert(1)',
    'city=Karachi',
    42,
    undefined,
  ])('never sends a tap anywhere but this site: %s', (url) => {
    expect(toNotification({ ...payload, url }).options.data.url).toBe('/');
  });

  it('uses the default tag when none is given, and bounds over-long text', () => {
    const spec = toNotification({ title: 'T'.repeat(500), body: 'B'.repeat(900) });

    expect(spec.options.tag).toBe('wb-daily');
    expect(spec.title).toHaveLength(120);
    expect(spec.options.body).toHaveLength(300);
  });
});

describe('readPayload', () => {
  it('returns the parsed payload', () => {
    expect(readPayload({ json: () => ({ title: 'x' }) })).toEqual({ title: 'x' });
  });

  it('returns undefined, without throwing, when there is no data or it is not JSON', () => {
    expect(readPayload(null)).toBeUndefined();
    expect(readPayload(undefined)).toBeUndefined();
    expect(
      readPayload({
        json: () => {
          throw new SyntaxError('Unexpected token');
        },
      }),
    ).toBeUndefined();
  });

  it('together they always produce something to show', () => {
    const unreadable = {
      json: () => {
        throw new SyntaxError('Unexpected token');
      },
    };

    expect(toNotification(readPayload(unreadable))).toEqual(FALLBACK);
    expect(toNotification(readPayload(null))).toEqual(FALLBACK);
  });
});

describe('openFromNotification', () => {
  const ORIGIN = 'https://weatherboard.example';
  const URL_TO_OPEN = '/?city=Karachi~~PK~24.8607~67.0011';

  function windowAt(url: string, navigate: () => Promise<unknown> = () => Promise.resolve(null)) {
    return { url, focus: vi.fn(() => Promise.resolve(null)), navigate: vi.fn(navigate) };
  }

  function clientsWith(windows: ReturnType<typeof windowAt>[]) {
    return {
      matchAll: vi.fn<WindowClients['matchAll']>(() => Promise.resolve(windows)),
      openWindow: vi.fn<WindowClients['openWindow']>(() => Promise.resolve(null)),
    };
  }

  it('focuses a window that is already open and takes it to the city', async () => {
    const open = windowAt(`${ORIGIN}/?city=Lahore~Punjab~PK~31.5497~74.3436`);
    const clients = clientsWith([open]);

    await openFromNotification(clients, ORIGIN, URL_TO_OPEN);

    expect(open.focus).toHaveBeenCalledOnce();
    expect(open.navigate).toHaveBeenCalledWith(URL_TO_OPEN);
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it('looks at every window of the site, including ones the worker does not control yet', async () => {
    const clients = clientsWith([]);

    await openFromNotification(clients, ORIGIN, URL_TO_OPEN);

    expect(clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  });

  it('opens a new window when none is open', async () => {
    const clients = clientsWith([]);

    await openFromNotification(clients, ORIGIN, URL_TO_OPEN);

    expect(clients.openWindow).toHaveBeenCalledWith(URL_TO_OPEN);
  });

  it('ignores a window that belongs to another site', async () => {
    const other = windowAt('https://elsewhere.example/');
    const clients = clientsWith([other]);

    await openFromNotification(clients, ORIGIN, URL_TO_OPEN);

    expect(other.focus).not.toHaveBeenCalled();
    expect(clients.openWindow).toHaveBeenCalledWith(URL_TO_OPEN);
  });

  it('uses the first matching window when several are open', async () => {
    const first = windowAt(`${ORIGIN}/`);
    const second = windowAt(`${ORIGIN}/?preview=ui`);
    const clients = clientsWith([first, second]);

    await openFromNotification(clients, ORIGIN, URL_TO_OPEN);

    expect(first.focus).toHaveBeenCalledOnce();
    expect(second.focus).not.toHaveBeenCalled();
  });

  it('keeps the window focused, without opening a second one, when it refuses to navigate', async () => {
    const open = windowAt(`${ORIGIN}/`, () => Promise.reject(new TypeError('cannot navigate')));
    const clients = clientsWith([open]);

    await expect(openFromNotification(clients, ORIGIN, URL_TO_OPEN)).resolves.toBeUndefined();

    expect(open.focus).toHaveBeenCalledOnce();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });
});
