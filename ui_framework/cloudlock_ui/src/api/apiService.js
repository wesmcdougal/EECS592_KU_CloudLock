const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

let accessToken = localStorage.getItem('cloudlock_token') || null;

export function setAccessToken(token) {
  accessToken = token;
  if (token) {
    localStorage.setItem('cloudlock_token', token);
  } else {
    localStorage.removeItem('cloudlock_token');
  }
}

export async function post(endpoint, data, timeout = 30000) {
  return fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
    },
    body: JSON.stringify(data),
  }, timeout);
}

export async function put(endpoint, data, timeout = 10000) {
  return fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
    },
    body: JSON.stringify(data),
  }, timeout);
}

export async function get(endpoint, timeout = 10000) {
  return fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
    },
  }, timeout);
}

export default {
  post,
  put,
  get,
};

// Helper for fetch with timeout
async function fetchWithTimeout(url, options, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    if (!response.ok) {
      let error = response.statusText;
      try {
        const payload = await response.json();
        error = payload.detail || payload.error || error;
      } catch {
        try {
          error = await response.text() || error;
        } catch {
          error = response.statusText;
        }
      }
      return { status: response.status, error };
    }
    return response.json();
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      return { status: 'timeout', error: 'Request timed out' };
    }
    return { status: 'error', error: error.message || 'Unknown error' };
  }
}