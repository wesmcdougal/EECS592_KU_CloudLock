import { Link } from "react-router-dom";
import LoginForm from "../components/LoginForm";

function LoginPage() {

    return (
        <>
            <h1>Login</h1>
            <p>Please enter your login credentials</p>

            <LoginForm />

            <ul>
                <li><Link to="/signup">Signup instead</Link></li>
                <li><Link to="/">Return Home</Link></li>
            </ul>
        </>
    );
}

export default LoginPage;