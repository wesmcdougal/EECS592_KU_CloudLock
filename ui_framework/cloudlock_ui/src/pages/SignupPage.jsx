/*
Signup Page Component
This component renders the signup form and provides navigation to the login page and home page.
*/

import SignupForm from "../components/SignupForm";
import ActionButton from "../components/ActionButton";


function SignupPage() {

    return (
        <>
            <h1>Sign-up</h1>
            <p>Please enter your signup info</p>

            <SignupForm />

            <div className="home-buttons">
                <div className="container">
                    <ActionButton
                        id="signup-login-button"
                        className="home-action-button"
                        label="LOGIN"
                        to="/login"
                    />
                </div>
                <div className="container">
                    <ActionButton
                        id="signup-home-button"
                        className="home-action-button"
                        label="HOME"
                        to="/"
                    />
                </div>
            </div>
        </>
    );
}

export default SignupPage;