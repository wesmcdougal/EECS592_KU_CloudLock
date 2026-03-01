export async function register(username, authVerifier, salt) {
  return fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, authVerifier, salt }),
  });
}

export async function getSalt(username) {
  return fetch(`/api/salt/${username}`);
}