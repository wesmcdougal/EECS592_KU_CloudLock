import LoginForm from "../components/LoginForm";
import ActionButton from "../components/ActionButton";

function LoginPage() {

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
            </div>
        </>
    );
}

export default LoginPage;