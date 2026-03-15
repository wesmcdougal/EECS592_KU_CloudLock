import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
    const token = localStorage.getItem("cloudlock_token");

    // Optionally: add token format/expiration check here
    if (!token) {
        return <Navigate to="/login" replace />;
    }

    return children;
}