import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const signupMessage =
    location.state?.signupSuccess
    ? "Account created successfully. Please log in."
    : "";

  async function handleLogin(event) {
    event.preventDefault();

    // TEMPORARY: bypass authentication
    navigate("/main");
  }


  return (
    <form onSubmit={handleLogin}>
    <div className="login-form">

      {signupMessage && (
        <p className="success-message">{signupMessage}</p>
      )}

      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={e => setUsername(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />

      <button type="submit">Login</button>
    </div>
    </form>
  );
}