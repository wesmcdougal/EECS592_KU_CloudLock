import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { deriveKey } from "../crypto/keyDerivation";
import { envelopeDecrypt } from "../crypto/envelopeDecrypt";
import { loadCachedEncryptedVault } from "../crypto/storageFormat";
import { AuthContext } from "../context/AuthContext";

export default function OfflineUnlockModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { setMasterKey, setToken } = useContext(AuthContext);
  const navigate = useNavigate();

  async function handleOfflineUnlock(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const cachedEnvelope = loadCachedEncryptedVault();
      if (!cachedEnvelope) {
        setMessage("No cached vault found. Please sync online at least once.");
        setLoading(false);
        return;
      }
      const masterKey = await deriveKey(password, email.trim().toLowerCase());
      // Try to decrypt to verify password
      try {
        await envelopeDecrypt(cachedEnvelope, masterKey);
      } catch (err) {
        setMessage("Unlock failed: Incorrect password or corrupted cache.");
        setLoading(false);
        return;
      }
      setMasterKey(masterKey);
      setToken(null); // No backend token in offline mode
      setLoading(false);
      navigate("/main", { state: { username: email.trim() + " (offline)" } });
      if (onClose) onClose();
    } catch (err) {
      setMessage("Unlock failed: " + (err?.message || err));
      setLoading(false);
    }
  }

  return (
    <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="Offline Unlock">
      <div className="entity-modal">
        <form onSubmit={handleOfflineUnlock}>
          <h2>Offline Unlock</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Master Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {message && <div className="error-message" style={{ color: 'red', margin: '8px 0' }}>{message}</div>}
          <div className="entity-modal-actions">
            <button type="submit" className="action-button entity-modal-button" aria-label="Unlock" disabled={loading}>
              {loading ? "Unlocking..." : "UNLOCK"}
            </button>
            <button type="button" className="action-button entity-modal-button" data-label="CANCEL" aria-label="Cancel" onClick={onClose}>
              
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
