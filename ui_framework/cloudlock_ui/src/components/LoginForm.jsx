/**
 * Login Form Component (LoginForm.jsx)
 *
 * Renders login and MFA verification UI. Responsibilities include:
 * - Collecting login credentials and dispatching login requests
 * - Handling MFA-required login states and challenge flow
 * - Verifying TOTP and biometric MFA methods
 * - Completing successful login by deriving and storing master key state
 * - Navigation to protected main page after authentication
 *
 * Revision History:
 * - Wesley McDougal - 09APR2026 - Enhanced MFA modal logic, added fallback for WebAuthn on Android, improved error messages, and clarified login flow for biometric and TOTP.
 * - Wesley McDougal - 29MAR2026 - Added MFA modal and WebAuthn/TOTP verification flow
 */

import { useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import eyeOpen from "../assets/eyeopen.png";
import eyeClose from "../assets/eyeclose.png";
import { login, verifyLoginMfa, verifyImageAuth } from "../api/authApi";
import { getWebAuthnMfaChallenge, getWebAuthnAssertion } from "../api/webauthnApi";
import { deriveKey } from "../crypto/keyDerivation";
import { clearCachedEncryptedVault } from "../crypto/storageFormat";
import { AuthContext } from "../context/AuthContext";
import FinalAuthStep from "./FinalAuthStep";

/**
 * Generate a device fingerprint hash based on browser/device characteristics.
 * Includes user agent, screen info, timezone, and language for uniqueness.
 */
function generateDeviceFingerprint() {
  const fingerprint = {
    userAgent: navigator.userAgent,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
  };
  
  // Simple hash of the fingerprint data for storage
  const stringified = JSON.stringify(fingerprint);
  let hash = 0;
  for (let i = 0; i < stringified.length; i++) {
    const char = stringified.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setMasterKey, setToken } = useContext(AuthContext);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [mfaMessage, setMfaMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitButtonState, setSubmitButtonState] = useState("");
  const [pendingMfa, setPendingMfa] = useState(null);
  const [totpCode, setTotpCode] = useState("");
  const [isMfaVerifying, setIsMfaVerifying] = useState(false);
  const [pendingImageAuth, setPendingImageAuth] = useState(null); // { imageChallengeToken }
  const [isImageVerifying, setIsImageVerifying] = useState(false);
  const [imageMfaMessage, setImageMfaMessage] = useState("");
  const timeoutsRef = useRef([]);

  const signupMessage =
    location.state?.signupSuccess
    ? "Account created successfully. Please log in."
    : "";
  const isFormValid = email.trim() && password.trim();

  useEffect(() => {
    // Always start with empty credentials when entering the login screen.
    setEmail("");
    setPassword("");

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  function queueTimeout(callback, delay) {
    const timeoutId = setTimeout(callback, delay);
    timeoutsRef.current.push(timeoutId);
  }

  async function completeSuccessfulLogin(accessToken) {
    const masterKey = await deriveKey(password, email.trim().toLowerCase());
    // Prevent stale cached envelope from a different account/key from causing
    // an OperationError on first vault load after login.
    clearCachedEncryptedVault();
    setMasterKey(masterKey);
    setToken(accessToken);
    setSubmitButtonState("validate");
    const resolvedUsername = location.state?.username || localStorage.getItem("cloudlock_username") || "User";
    localStorage.setItem("cloudlock_username", resolvedUsername);
    navigate("/main", {
      state: {
        username: resolvedUsername,
      },
    });
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setMessage("Please fill in both email and password.");
      return;
    }

    if (!email.trim().includes("@")) {
      setMessage("Please log in with your email address. Username-only login is not supported.");
      return;
    }

    setMessage("");
    setSubmitButtonState("onclic");

    try {
      const response = await login({
        email: email.trim(),
        password,
        deviceFingerprint: generateDeviceFingerprint(),
      });

      if (response?.requires_mfa && response?.mfa_challenge_token) {
        setPendingMfa({
          challengeToken: response.mfa_challenge_token,
          methods: response.mfa_types || [],
        });
        setSubmitButtonState("");
        setMfaMessage("MFA verification required.");
        return;
      }

      if (response?.requires_image_auth && response?.image_challenge_token) {
        setPendingImageAuth({ imageChallengeToken: response.image_challenge_token });
        setSubmitButtonState("");
        return;
      }

      if (response?.access_token) {
        await completeSuccessfulLogin(response.access_token);
      } else {
        setMessage(response?.error || "Login failed. Please check your credentials.");
        setSubmitButtonState("");
      }
    } catch (err) {
      setMessage("Login error: " + (err?.message || err));
      setSubmitButtonState("");
    }
  }

  async function handleVerifyMfa(method) {
    if (!pendingMfa?.challengeToken) {
      return;
    }

    setIsMfaVerifying(true);
    setMfaMessage("");

    try {
      let response;

      if (method === "biometric") {
        // Use WebAuthn assertion for biometric
        try {
          const challengeResponse = await getWebAuthnMfaChallenge(pendingMfa.challengeToken);
          response = await getWebAuthnAssertion(challengeResponse);
        } catch (webauthnError) {
          setMfaMessage("Biometric verification failed: " + (webauthnError.message || webauthnError));
          setIsMfaVerifying(false);
          return;
        }
      } else if (method === "totp") {
        // Use TOTP code
        response = await verifyLoginMfa({
          challengeToken: pendingMfa.challengeToken,
          method,
          totpCode: method === "totp" ? totpCode.trim() : null,
          deviceId: null,
        });
      }

      if (response?.requires_image_auth && response?.image_challenge_token) {
        setPendingMfa(null);
        setTotpCode("");
        setPendingImageAuth({ imageChallengeToken: response.image_challenge_token });
        return;
      }

      if (response?.access_token) {
        setPendingMfa(null);
        setTotpCode("");
        await completeSuccessfulLogin(response.access_token);
        return;
      }

      setMfaMessage(response?.error || "MFA verification failed.");
    } catch (err) {
      setMfaMessage("MFA verification error: " + (err?.message || err));
    } finally {
      setIsMfaVerifying(false);
    }
  }

  async function handleImageAuthConfirm(authImageHash) {
    if (!pendingImageAuth?.imageChallengeToken) return;
    setIsImageVerifying(true);
    setImageMfaMessage("");
    try {
      const response = await verifyImageAuth({
        imageChallengeToken: pendingImageAuth.imageChallengeToken,
        authImageHash,
      });
      if (response?.access_token) {
        setPendingImageAuth(null);
        await completeSuccessfulLogin(response.access_token);
        return;
      }
      setImageMfaMessage("Authentication failed. Please try again.");
    } catch (err) {
      setImageMfaMessage("Authentication error: " + (err?.message || err));
    } finally {
      setIsImageVerifying(false);
    }
  }


  return (
    <form onSubmit={handleLogin}>
      <div className="login-form">
        {signupMessage && (
          <p className="success-message">{signupMessage}</p>
        )}
        {message && (
          <p className="error-message">{message}</p>
        )}
        <input
          type="email"
          placeholder="Email"
          autoComplete="off"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <div className="password-field">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(prev => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            <img
              src={showPassword ? eyeClose : eyeOpen}
              alt={showPassword ? "Hide password" : "Show password"}
              className="password-toggle-icon"
            />
          </button>
        </div>
        <button
          type="submit"
          disabled={!isFormValid}
          className={`action-button login-submit-button ${submitButtonState}`.trim()}
          data-label="LOGIN"
          aria-label="Login"
        />
        <div style={{ marginTop: 16 }}>
          <Link to="/recovery">Forgot password? Account recovery</Link>
        </div>
      </div>

      {pendingMfa && (
        <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="MFA verification">
          <div className="entity-modal">
            <h2>MFA Verification</h2>
            <p>Complete a second factor to finish login.</p>

            {mfaMessage && (
              <p className="error-message">{mfaMessage}</p>
            )}

            {pendingMfa.methods.includes("biometric") && (
              <button
                type="button"
                className="action-button entity-modal-button"
                data-label="VERIFY BIOMETRIC"
                aria-label="Verify biometric MFA"
                disabled={isMfaVerifying}
                onClick={() => handleVerifyMfa("biometric")}
              />
            )}

            {pendingMfa.methods.includes("totp") && (
              <>
                <input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  maxLength={6}
                />
                <button
                  type="button"
                  className="action-button entity-modal-button"
                  data-label="VERIFY CODE"
                  aria-label="Verify TOTP MFA"
                  disabled={isMfaVerifying || totpCode.trim().length !== 6}
                  onClick={() => handleVerifyMfa("totp")}
                />
              </>
            )}

            <button
              type="button"
              className="action-button entity-modal-button"
              data-label="CANCEL"
              aria-label="Cancel MFA verification"
              disabled={isMfaVerifying}
              onClick={() => {
                setPendingMfa(null);
                setMfaMessage("");
                setTotpCode("");
              }}
            />
          </div>
        </div>
      )}
      {pendingImageAuth && (
        <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="Final authentication">
          <div className="entity-modal">
            {imageMfaMessage && <p className="error-message">{imageMfaMessage}</p>}
            <FinalAuthStep
              onConfirm={handleImageAuthConfirm}
              onCancel={() => { setPendingImageAuth(null); setImageMfaMessage(""); }}
              isLoading={isImageVerifying}
            />
          </div>
        </div>
      )}
    </form>
  );
}