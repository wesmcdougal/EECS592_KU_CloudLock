/*
Login Page Component
This component renders the login form and provides navigation to the signup page and home page.
It also includes a button to open the offline unlock modal for users who want to access their vault without an internet connection.
*/

import LoginForm from "../components/LoginForm";
import ActionButton from "../components/ActionButton";
import { useState } from "react";
import OfflineUnlockModal from "../components/OfflineUnlockModal";


function LoginPage() {
    const [showOfflineModal, setShowOfflineModal] = useState(false);

    return (
        <>
            <h1>LOGIN</h1>
            <p>Please enter your login credentials</p>

            <LoginForm />

            <div className="home-buttons">
                <div className="container">
                    <ActionButton
                        id="login-signup-button"
                        className="home-action-button"
                        label="SIGNUP"
                        to="/signup"
                    />
                </div>
                <div className="container">
                    <ActionButton
                        id="login-home-button"
                        className="home-action-button"
                        label="HOME"
                        to="/"
                    />
                </div>
                <div className="container">
                    <button
                        className="action-button home-action-button"
                        style={{ marginTop: 0, width: 'auto', padding: '0 20px', whiteSpace: 'nowrap' }}
                        onClick={() => setShowOfflineModal(true)}
                    >
                        OFFLINE UNLOCK
                    </button>
                </div>
            </div>
            {showOfflineModal && (
                <OfflineUnlockModal onClose={() => setShowOfflineModal(false)} />
            )}
        </>
    );
}

export default LoginPage;