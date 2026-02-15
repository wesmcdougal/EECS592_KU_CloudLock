import { useNavigate, Link } from 'react-router-dom';


function MainPage() {
    return (
        <>
            <h1>User Page</h1>
            <p>This is the user page.</p>
            <nav>
                <ul>
                    <li><Link to="/login">Login</Link></li>
                    <li><Link to="/signup">Signup</Link></li>
                    <li><Link to="/">Welcome Page</Link></li>
                </ul>
            </nav>
        </>
        
    );
}

export default MainPage;