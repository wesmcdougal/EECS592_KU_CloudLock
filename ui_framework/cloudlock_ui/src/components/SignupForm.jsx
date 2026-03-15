import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import eyeOpen from '../assets/eyeopen.png';
import eyeClose from '../assets/eyeclose.png';
import { deriveKey } from '../crypto/keyDerivation';
import { encryptMasterKeyWithRecovery } from '../crypto/recovery';
import { generateStrongPassword } from '../crypto/passwordGenerator';
import { getPasswordStrength } from '../crypto/passwordStrength';

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '', confirmPassword: '', recovery: '' });
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitButtonState, setSubmitButtonState] = useState('');
  const timeoutsRef = useRef([]);
  const passwordsMatch = form.password === form.confirmPassword;
  const passwordStrength = getPasswordStrength(form.password);
  const isFormValid = form.email.trim() && form.username.trim() && form.password.trim() && form.confirmPassword.trim() && form.recovery.trim() && passwordsMatch && passwordStrength.label === 'Very Strong';
  const [generatedPassword, setGeneratedPassword] = useState('');

  function handleGeneratePassword() {
    const pwGen = generateStrongPassword(14);
    setGeneratedPassword(pwGen);

    // Auto-fills password fields with generated password.
    setForm(prev => ({
      ...prev,
      password: pwGen,
      confirmPassword: pwGen,
    }));

    setMessage('');
  }

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  function queueTimeout(callback, delay) {
    const timeoutId = setTimeout(callback, delay);
    timeoutsRef.current.push(timeoutId);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.email.trim() || !form.username.trim() || !form.password.trim() || !form.confirmPassword.trim() || !form.recovery.trim()) {
      setMessage('Please fill in all fields, including recovery info.');
      return;
    }

    if (!passwordsMatch) {
      setMessage('Password and Confirm Password must match exactly.');
      return;
    }

    setMessage('');
    setSubmitButtonState('onclic');

    try {
      // Emergency Recovery Logic
      // 1. Derive master key from password (simulate PBKDF2)
      const salt = form.username; // For demo, use username as salt (should use random salt in production)
      const masterKey = await deriveKey(form.password, salt);
      // 2. Export masterKey to raw bytes
      const masterKeyRaw = new Uint8Array(await window.crypto.subtle.exportKey('raw', masterKey));
      // 3. Encrypt masterKeyRaw with recovery info
      const encryptedRecovery = await encryptMasterKeyWithRecovery(masterKeyRaw, form.recovery, salt);

      // 4. Derive authVerifier for zero-knowledge
      const authVerifier = await deriveKey(form.password, salt);
      const authVerifierRaw = new Uint8Array(await window.crypto.subtle.exportKey('raw', authVerifier));

      // 5. Encrypt initial vault (empty or with recovery info)
      const encryptedVaultData = encryptedRecovery; // For demo, use recovery-encrypted master key

      // 6. Call signup API
      const { signup } = await import('../api/authApi');
      const response = await signup(form.username.trim(), authVerifierRaw, salt, encryptedVaultData);

      if (response?.token) {
        setSubmitButtonState('validate');
        navigate("/login", {
          state: {
            signupSuccess: true,
            username: form.username
          }
        });
      } else {
        setMessage(response?.error || "Signup failed. Please try again.");
        setSubmitButtonState('');
      }
    } catch (err) {
      setMessage("Signup error: " + (err?.message || err));
      setSubmitButtonState('');
    }
  }


  return (
    <form onSubmit={handleSubmit}>
    <div className='signup-form'>

      {message && (
        <p className="error-message">{message}</p>
      )}

      <input 
        type="email"
        placeholder="Email Address"
        value={form.email}
        onChange={e => setForm({ ...form, email: e.target.value })}
      />
      
      <input 
        type="text"
        placeholder="Username"
        value={form.username}
        onChange={e => setForm({ ...form, username: e.target.value })}
      />

      <div className="password-field">
        <input 
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
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

      <div className="password-field">
        <input 
          type={showConfirmPassword ? "text" : "password"}
          placeholder="Confirm Password"
          value={form.confirmPassword}
          onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShowConfirmPassword(prev => !prev)}
          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
        >
          <img
            src={showConfirmPassword ? eyeClose : eyeOpen}
            alt={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            className="password-toggle-icon"
          />
        </button>
      </div>

      {form.password && (
        <>
          <p className="password-strength-text">
            Password strength: 
            <span className={`strength-${passwordStrength.label.replace(/\s+/g, '').toLowerCase()}`}>
              {" "}{passwordStrength.label}
            </span>
          </p>

          {passwordStrength.label !== 'Very Strong' && (
            <p className="password-strength-warning">
              Password must be <span className="strength-verystrong">Very Strong</span> to sign up. Try upper, lower, numbers, symbols, and avoid dictionary words.
            </p>
          )}
        </>
      )}

      <div className="generate-button-container">
      <button
        type="button"
        className="action-button"
        onClick={handleGeneratePassword}
      >
        GENERATE?
      </button>
      </div>

      <input
        type="text"
        placeholder="Recovery Key or Security Answer"
        value={form.recovery}
        onChange={e => setForm({ ...form, recovery: e.target.value })}
      />

      <button
        type="submit"
        disabled={!isFormValid}
        className={`action-button signup-submit-button ${submitButtonState}`.trim()}
        data-label="SIGN UP"
        aria-label="Sign Up"
      />
    </div>
    </form>
  );
}