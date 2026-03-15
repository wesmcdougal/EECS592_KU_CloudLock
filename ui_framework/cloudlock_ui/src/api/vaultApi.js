import { put, get } from './apiService';

export async function saveVault(encryptedVault) {
  // Token is attached automatically by apiService
  return put('/vault', encryptedVault);
}

export async function getVault() {
  return get('/vault');
}