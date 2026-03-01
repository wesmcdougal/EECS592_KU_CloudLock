import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { decryptMasterKeyWithRecovery } from "../crypto/recovery";
import { deriveKey } from "../crypto/keyDerivation";

export default function RecoveryPage() {
  const [username, setUsername] = useState("");
  const [recovery, setRecovery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleRecovery(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      // Fetch encrypted recovery blob from backend (replace with real API call)
      const res = await fetch(`/api/recovery/${username}`);
      if (!res.ok) throw new Error("User not found or no recovery set");
      const { encryptedRecovery, salt } = await res.json();
      // Decrypt master key using recovery info
      const masterKeyRaw = await decryptMasterKeyWithRecovery(encryptedRecovery, recovery, salt || username);
      // Optionally, re-derive masterKey CryptoKey from raw
      const masterKey = await window.crypto.subtle.importKey(
        "raw",
        new Uint8Array(masterKeyRaw),
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
      // Redirect to login or main page with recovered key (simulate for now)
      setMessage("Recovery successful! You can now log in.");
      setTimeout(() => navigate("/login", { state: { recovered: true, username } }), 2000);
    } catch (err) {
      setMessage("Recovery failed: " + err.message);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleRecovery} className="recovery-form">
      <h2>Account Recovery</h2>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={e => setUsername(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Recovery Key or Security Answer"
        value={recovery}
        onChange={e => setRecovery(e.target.value)}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? "Recovering..." : "Recover Account"}
      </button>
      {message && <p>{message}</p>}
    </form>
  );
}
