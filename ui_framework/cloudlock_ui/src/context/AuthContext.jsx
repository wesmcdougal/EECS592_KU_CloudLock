import { createContext, useState } from "react";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [masterKey, setMasterKey] = useState(null);
  const [token, setToken] = useState(null);

  function logout() {
    setMasterKey(null); // 🔥 clear key from memory
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ masterKey, setMasterKey, token, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}