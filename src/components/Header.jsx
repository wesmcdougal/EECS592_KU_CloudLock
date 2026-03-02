import { Link } from "react-router-dom";

function Header() {

    return (
        <header className="header">
            <h1>Article Share App</h1>
            <nav>
                <ul>
                    <li><Link className="nav-link login-link" to="/login">Login</Link></li>
                    <li><Link className="nav-link register-link" to="/register">Register</Link></li>
                </ul>
            </nav>
        </header>
    );
}

export default Header