import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom'
import eyeOpen from '../assets/eyeopen.png';
import eyeClose from '../assets/eyeclose.png';

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitButtonState, setSubmitButtonState] = useState('');
  const timeoutsRef = useRef([]);
  const passwordsMatch = form.password === form.confirmPassword;
  const isFormValid = form.email.trim() && form.username.trim() && form.password.trim() && form.confirmPassword.trim() && passwordsMatch;

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

    if (!form.email.trim() || !form.username.trim() || !form.password.trim() || !form.confirmPassword.trim()) {
      setMessage('Please fill in all fields.');
      return;
    }

    if (!passwordsMatch) {
      setMessage('Password and Confirm Password must match exactly.');
      return;
    }

    setMessage('');
    setSubmitButtonState('onclic');

    // TEMPORARY: bypass authentication
    // Redirect to login WITH state
    queueTimeout(() => {
      setSubmitButtonState('validate');
      navigate("/login", {
        state: {
          signupSuccess: true,
          username: form.username
        }
      });
    }, 2250);

    queueTimeout(() => {
      setSubmitButtonState('');
    }, 3500);
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