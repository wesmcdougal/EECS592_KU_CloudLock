import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import MainPage from "./pages/MainPage";
import RecoveryPage from "./pages/RecoveryPage";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (

      <Routes>
        <Route path="/" element={<HomePage />}></Route>
        <Route path="/login" element={<LoginPage />}></Route>
        <Route path="/signup" element={<SignupPage />}></Route>
        <Route path="/main" element={<MainPage />}></Route>
        <Route path="/recovery" element={<RecoveryPage />}></Route>
      </Routes>

  );
}

export default App;
