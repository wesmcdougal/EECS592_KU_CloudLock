import apiService, { setAccessToken } from './apiService';

// Signup/register: send encrypted verifier and salt (zero-knowledge)
export async function signup(username, authVerifier, salt, encryptedVaultData) {
  // encryptedVaultData: client-side encrypted vault
  const response = await apiService.post('/auth/signup', {
    username,
    authVerifier,
    salt,
    vault: encryptedVaultData,
  });
  if (response.token) setAccessToken(response.token);
  return response;
}


export async function login(username, authVerifier) {
  const response = await apiService.post('/auth/login', {
    username,
    authVerifier,
  });
  if (response.token) setAccessToken(response.token);
  return response;
}


export async function logout() {
  const response = await apiService.post('/auth/logout', {});
  setAccessToken(null);
  return response;
}


export async function getSalt(username) {
  return apiService.post('/auth/salt', { username });
}
