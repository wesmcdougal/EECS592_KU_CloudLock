import { Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import MainPage from "./pages/MainPage";
import RecoveryPage from "./pages/RecoveryPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import KeyfileMfaDemo from "./components/KeyfileMfaDemo";

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
        <Route path="/recovery" element={<RecoveryPage />}></Route>
        <Route path="/keyfile-mfa-demo" element={<KeyfileMfaDemo />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
