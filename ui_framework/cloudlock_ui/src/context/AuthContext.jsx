import { createContext, useState } from "react";

import { setAccessToken } from "../api/apiService";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [masterKey, setMasterKey] = useState(null);
  const [token, setTokenState] = useState(localStorage.getItem("cloudlock_token") || null);

  function setToken(value) {
    setTokenState(value);
    setAccessToken(value);
  }

  function logout() {
    setMasterKey(null);
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ masterKey, setMasterKey, token, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}