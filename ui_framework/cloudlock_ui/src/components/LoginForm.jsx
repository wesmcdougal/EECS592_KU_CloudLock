import { useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import eyeOpen from "../assets/eyeopen.png";
import eyeClose from "../assets/eyeclose.png";
import { login } from "../api/authApi";
import { deriveKey } from "../crypto/keyDerivation";
import { AuthContext } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setMasterKey, setToken } = useContext(AuthContext);

  const [email, setEmail] = useState(location.state?.email || "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitButtonState, setSubmitButtonState] = useState("");
  const timeoutsRef = useRef([]);

  const signupMessage =
    location.state?.signupSuccess
    ? "Account created successfully. Please log in."
    : "";
  const isFormValid = email.trim() && password.trim();

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

    if (!email.trim() || !password.trim()) {
      setMessage("Please fill in both email and password.");
      return;
    }

    setMessage("");
    setSubmitButtonState("onclic");

    try {
      const response = await login({
        email: email.trim(),
        password,
        deviceFingerprint: 'browser_test',
      });

      if (response?.access_token) {
        const masterKey = await deriveKey(password, email.trim().toLowerCase());
        setMasterKey(masterKey);
        setToken(response.access_token);
        setSubmitButtonState("validate");
        navigate("/main", {
          state: {
            username: response.username || location.state?.username || email.trim(),
          },
        });
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
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
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