/*
Storage format utilities
*/

// Pending Vault Operations Queue
const VAULT_OPS_QUEUE_KEY = 'cloudlock_vault_ops_queue';

// Add an operation to the queue
export function queueVaultOperation(op) {
	if (!op || typeof op !== 'object') return;
	try {
		const queue = loadVaultOpsQueue();
		queue.push({ ...op, timestamp: Date.now() });
		localStorage.setItem(VAULT_OPS_QUEUE_KEY, JSON.stringify(queue));
	} catch (e) {
		console.error('Failed to queue vault operation:', e);
	}
}

// Load the queue
export function loadVaultOpsQueue() {
	try {
		const data = localStorage.getItem(VAULT_OPS_QUEUE_KEY);
		if (data) return JSON.parse(data);
	} catch (e) {
		console.error('Failed to load vault ops queue:', e);
	}
	return [];
}

// Clear the queue
export function clearVaultOpsQueue() {
	try {
		localStorage.removeItem(VAULT_OPS_QUEUE_KEY);
	} catch (e) {}
}
// Utility for storing/retrieving encrypted vault envelope in localStorage (never plaintext)

const ENCRYPTED_VAULT_KEY = 'cloudlock_encrypted_vault';

// Save encrypted envelope to localStorage
export function cacheEncryptedVault(envelope) {
	if (!envelope || typeof envelope !== 'object') return;
	try {
		localStorage.setItem(ENCRYPTED_VAULT_KEY, JSON.stringify(envelope));
	} catch (e) {
		// Storage may be full or unavailable
		console.error('Failed to cache encrypted vault:', e);
	}
}

// Load encrypted envelope from localStorage
export function loadCachedEncryptedVault() {
	try {
		const data = localStorage.getItem(ENCRYPTED_VAULT_KEY);
		if (data) {
			return JSON.parse(data);
		}
	} catch (e) {
		console.error('Failed to load cached encrypted vault:', e);
	}
	return null;
}

// Remove cached envelope (optional, not used yet)
export function clearCachedEncryptedVault() {
	try {
		localStorage.removeItem(ENCRYPTED_VAULT_KEY);
	} catch (e) {}
}
