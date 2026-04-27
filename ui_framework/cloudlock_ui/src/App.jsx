/*
Main application component that sets up routing and authentication context
This component uses React Router for navigation and provides the AuthContext to manage authentication state across the app.
*/

import { Routes, Route, useNavigate } from "react-router-dom";
import { useContext } from "react";

import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import MainPage from "./pages/MainPage";
import RecoveryPageQR from "./pages/RecoveryPageQR";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import KeyfileMfaDemo from "./components/KeyfileMfaDemo";

function RecoveryRoute() {
  const { setMasterKey, setToken } = useContext(AuthContext);
  const navigate = useNavigate();

  async function handleRecovered(masterKeyRaw, userId, accessToken) {
    const bytes = masterKeyRaw instanceof Uint8Array
      ? masterKeyRaw
      : new Uint8Array(masterKeyRaw);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    setMasterKey(cryptoKey);
    setToken(accessToken);
    // Navigate to /main — the new QR is still displayed in RecoveryPageQR for saving
  }

  return <RecoveryPageQR onRecovered={handleRecovered} />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />}></Route>
        <Route path="/login" element={<LoginPage />}></Route>
        <Route path="/signup" element={<SignupPage />}></Route>
        <Route
          path="/main"
          element={(
            <ProtectedRoute>
              <MainPage />
            </ProtectedRoute>
          )}
        ></Route>
        <Route path="/recovery" element={<RecoveryRoute />}></Route>
        <Route path="/keyfile-mfa-demo" element={<KeyfileMfaDemo />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
