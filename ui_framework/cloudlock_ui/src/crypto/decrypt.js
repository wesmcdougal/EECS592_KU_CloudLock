export async function decryptData(encrypted, key) {
  const dec = new TextDecoder();

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(encrypted.iv),
    },
    key,
    new Uint8Array(encrypted.data)
  );

  return JSON.parse(dec.decode(decrypted));
}