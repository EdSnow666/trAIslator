/**
 * 职责: 检测后端、完成登录和首次改密，并把真实身份呈现在现有 Demo 顶栏
 * 依赖内部: 无
 * 依赖外部: Fetch API, DOM API
 * 暴露: initializeAuth | apiRequest | currentAuth
 */

export const currentAuth = {
  mode: 'checking',
  user: null,
};

const roleLabels = {
  admin: '管理员',
  teacher: '教师',
  student: '学生',
  experiment_user: '实验用户',
};

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `请求失败（${response.status}）`);
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}

export async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });
  return parseResponse(response);
}

async function backendAvailable() {
  try {
    const response = await fetch('/api/health', { credentials: 'same-origin' });
    return response.ok;
  } catch {
    return false;
  }
}

function authShell(title, message, fields, buttonLabel) {
  const root = document.createElement('div');
  root.className = 'auth-gate';
  root.innerHTML = `
    <form class="auth-card">
      <div class="auth-brand">TA</div>
      <h1>${title}</h1>
      <p class="muted">${message}</p>
      <div class="auth-fields">${fields}</div>
      <p class="auth-error" role="alert"></p>
      <button class="button button-primary auth-submit" type="submit">${buttonLabel}</button>
    </form>`;
  document.body.append(root);
  return root;
}

function waitForForm(root, submit) {
  return new Promise((resolve) => {
    root.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = root.querySelector('.auth-submit');
      button.disabled = true;
      try {
        resolve(await submit(new FormData(event.currentTarget)));
      } catch (error) {
        root.querySelector('.auth-error').textContent = error.message;
        button.disabled = false;
      }
    });
  });
}

async function requestLogin() {
  const fields = `
    <label>用户名<input class="field field-full" name="username" autocomplete="username" required></label>
    <label>密码<input class="field field-full" name="password" type="password"
      autocomplete="current-password" required></label>`;
  const root = authShell('登录 Translation AIducator', '账号由管理员创建，暂不开放注册。', fields, '登录');
  const result = await waitForForm(root, (data) => apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: data.get('username'), password: data.get('password') }),
  }));
  root.remove();
  return { ...result, password: root.querySelector('[name="password"]')?.value || '' };
}

async function requestPasswordChange(currentPassword) {
  const fields = `
    <label>当前密码<input class="field field-full" name="currentPassword" type="password"
      autocomplete="current-password" value="${currentPassword}" required></label>
    <label>新密码<input class="field field-full" name="newPassword" type="password"
      autocomplete="new-password" minlength="12" required></label>
    <label>确认新密码<input class="field field-full" name="confirmPassword" type="password"
      autocomplete="new-password" minlength="12" required></label>`;
  const root = authShell('首次登录：修改密码', '新密码至少 12 个字符。修改后需要重新登录。', fields, '保存新密码');
  await waitForForm(root, (data) => {
    if (data.get('newPassword') !== data.get('confirmPassword')) throw new Error('两次输入的新密码不一致。');
    return apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') }),
    });
  });
  root.remove();
}

function renderIdentity(user) {
  const labels = user.roles.map((role) => roleLabels[role] || role).join(' · ');
  const actions = document.querySelector('.top-actions');
  const selector = actions.querySelector('#role-select');
  const role = user.roles.some((item) => ['admin', 'teacher'].includes(item)) ? 'teacher' : 'student';
  actions.querySelector('.role-switcher > span').textContent = user.displayName;
  selector.innerHTML = `<option value="${role}">${labels}</option>`;
  selector.disabled = true;
  const logout = Object.assign(document.createElement('button'), {
    className: 'text-button', id: 'logout-button', textContent: '退出',
  });
  actions.append(logout);
  document.body.dataset.authLabel = `${user.displayName} · ${labels}`;
  const manager = user.roles.some((item) => ['admin', 'teacher'].includes(item));
  document.querySelector('#management-menu').hidden = !manager;
  document.querySelector('#management-button').hidden = !manager;
  document.querySelector('#project-management-button').hidden = !manager;
  document.querySelector('#personal-key-project').hidden = manager;
  document.querySelector('#personal-key-management').hidden = !manager;
  document.querySelector('#prompt-inspector-button').hidden = !user.roles.includes('admin');
  document.querySelector('.rail-footer span').textContent = '服务器版 · 已登录';
  logout.addEventListener('click', async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  });
}

async function authenticate() {
  try {
    return await apiRequest('/api/auth/me');
  } catch (error) {
    if (error.status !== 401) throw error;
    return requestLogin();
  }
}

export async function initializeAuth() {
  if (!await backendAvailable()) {
    currentAuth.mode = 'offline-demo';
    document.querySelector('#current-user-status').textContent = '本地离线演示';
    return currentAuth;
  }
  let result = await authenticate();
  if (result.user.mustChangePassword) {
    await requestPasswordChange(result.password || '');
    result = await requestLogin();
  }
  currentAuth.mode = 'server';
  currentAuth.user = result.user;
  renderIdentity(result.user);
  return currentAuth;
}
