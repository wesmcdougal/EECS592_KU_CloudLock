export async function saveVault(token, encryptedVault) {
  return fetch("/api/vault", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(encryptedVault),
  });
}

export async function getVault(token) {
  return fetch("/api/vault", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}