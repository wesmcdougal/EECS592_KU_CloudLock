/*
Vault API Service
Provides functions to interact with the vault-related endpoints of the backend API.
Handles saving and retrieving the encrypted vault data for the user.
*/

import { get, post } from './apiService';

export async function saveVault(encryptedVault) {
  return post('/vault/save', {
    encrypted_vault: JSON.stringify(encryptedVault),
  });
}

export async function getVault() {
  const response = await get('/vault/retrieve');
  if (response?.encrypted_vault) {
    return JSON.parse(response.encrypted_vault);
  }
  return response;
}