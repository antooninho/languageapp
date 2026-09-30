// Appels à l'API du serveur. Chaque fonction renvoie { status, body } ;
// une coupure réseau rejette la promesse (l'erreur de fetch est transmise telle quelle).

export function createApi(fetchFn = (...args) => fetch(...args)) {
  async function request(url, method, payload) {
    const init = { credentials: 'same-origin' };
    if (method) {
      init.method = method;
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(payload ?? {});
    }
    const response = await fetchFn(url, init);
    const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
    return { status: response.status, body: isJson ? await response.json() : null };
  }

  return {
    me: () => request('./api/me'),
    login: (username, password) => request('./api/login', 'POST', { username, password }),
    logout: () => request('./api/logout', 'POST', {}),
    loadData: () => request('./api/data'),
    putData: (key, value, version) => request(`./api/data/${key}`, 'PUT', { value, version }),
  };
}
