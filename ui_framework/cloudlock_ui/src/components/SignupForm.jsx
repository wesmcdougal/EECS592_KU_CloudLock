import { useState } from 'react';
import { useNavigate } from 'react-router-dom'

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [message, setMessage] = useState('');

 async function handleSubmit(event) {
    event.preventDefault();

    // TEMPORARY: bypass authentication
        // Redirect to login WITH state
      navigate("/login", {
        state: {
          signupSuccess: true,
          username: form.username
        }
      });
    }


  return (
    <form onSubmit={handleSubmit}>
    <div className='signup-form'>
      
      <input 
        type="text"
        placeholder="Username"
        value={form.username}
        onChange={e => setForm({ ...form, username: e.target.value })}
      />

      <input 
        type="password"
        placeholder="Password"
        value={form.password}
        onChange={e => setForm({ ...form, password: e.target.value })}
      />

      <button type="submit">Sign Up</button>
    </div>
    </form>
  );
}