/**
 * Route Guard Component (ProtectedRoute.jsx)
 *
 * Enforces authenticated navigation for protected pages. Responsibilities include:
 * - Checking token presence before route render
 * - Supporting dev-only auth bypass for UI preview mode
 * - Redirecting unauthenticated users to login
 *
 * Revision History:
 * - Wesley McDougal - 29MAR2026 - Added development auth bypass support
 */

import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
    const isDevBypassEnabled = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === "true";
    const token = localStorage.getItem("cloudlock_token");

    // Optionally: add token format/expiration check here
    if (!token && !isDevBypassEnabled) {
        return <Navigate to="/login" replace />;
    }

    return children;
}