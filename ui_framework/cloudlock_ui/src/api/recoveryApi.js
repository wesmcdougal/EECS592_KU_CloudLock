export async function createRecoveryRecord(body) {
  const response = await fetch('/api/recovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Failed to create recovery record.');
  }

  return response.json();
}

export async function getRecoveryRecord(userId) {
  const response = await fetch(`/api/recovery/${encodeURIComponent(userId)}`);

  if (!response.ok) {
    throw new Error('Recovery record not available.');
  }

  return response.json();
}

export async function rotateRecoveryRecord(body) {
  const response = await fetch('/api/recovery/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Failed to rotate recovery record.');
  }

  return response.json();
}