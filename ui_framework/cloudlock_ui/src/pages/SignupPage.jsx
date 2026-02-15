import { Link } from "react-router-dom";
import SignupForm from "../components/SignupForm";


function SignupPage() {

    return (
        <>
            <h1>Sign-up</h1>
            <p>Please enter your signup info</p>

            <SignupForm />

            <ul>
                <li><Link to="/login">Login instead</Link></li>
                <li><Link to="/">Return Home</Link></li>
            </ul>
        </>
    );
}

export default SignupPage;