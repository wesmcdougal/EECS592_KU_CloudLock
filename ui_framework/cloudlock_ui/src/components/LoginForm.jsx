import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import eyeOpen from "../assets/eyeopen.png";
import eyeClose from "../assets/eyeclose.png";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitButtonState, setSubmitButtonState] = useState("");
  const timeoutsRef = useRef([]);

  const signupMessage =
    location.state?.signupSuccess
    ? "Account created successfully. Please log in."
    : "";
  const isFormValid = username.trim() && password.trim();

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  function queueTimeout(callback, delay) {
    const timeoutId = setTimeout(callback, delay);
    timeoutsRef.current.push(timeoutId);
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setMessage("Please fill in both username and password.");
      return;
    }

    setMessage("");
    setSubmitButtonState("onclic");

    try {
      // --- Zero-knowledge: get salt, derive verifier, call login ---
      // 1. Get salt from backend
      const saltResp = await import('../api/authApi').then(mod => mod.getSalt(username.trim()));
      const saltData = await saltResp;
      const salt = saltData?.salt || username.trim(); // fallback

      // 2. Derive verifier (simulate SRP or PBKDF2)
      const { deriveKey } = await import('../crypto/keyDerivation');
      const authVerifier = await deriveKey(password, salt);
      // Export verifier to raw bytes (simulate)
      const authVerifierRaw = new Uint8Array(await window.crypto.subtle.exportKey('raw', authVerifier));

      // 3. Call login API
      const { login } = await import('../api/authApi');
      const response = await login(username.trim(), authVerifierRaw);

      if (response?.token) {
        setSubmitButtonState("validate");
        navigate("/main", { state: { username: username.trim() } });
      } else {
        setMessage(response?.error || "Login failed. Please check your credentials.");
        setSubmitButtonState("");
      }
    } catch (err) {
      setMessage("Login error: " + (err?.message || err));
      setSubmitButtonState("");
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
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <div className="password-field">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
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
    </form>
  );
}