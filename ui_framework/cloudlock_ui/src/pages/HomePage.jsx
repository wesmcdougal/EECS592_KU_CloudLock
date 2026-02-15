import { Link } from "react-router-dom";


function HomePage() {
    return (
        <>
            <h1>Welcome to CloudLock</h1>
            <p>This is the home page.</p>
            <nav>
                <ul>
                    <li><Link to="/login">Login</Link></li>
                    <li><Link to="/signup">Signup</Link></li>
                </ul>
            </nav>
        </>
        
    );
}

export default HomePage;