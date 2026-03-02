import { useEffect, useState } from "react";
import ActionButton from "../components/ActionButton";
import cloudlockIntro from "../assets/cloudlock_intro.gif";
import cloudlockIntroLast from "../assets/cloudlock_intro_last.png";

const INTRO_PLAY_DURATION_MS = 2000;

function HomePage() {
    const [isIntroPaused, setIsIntroPaused] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setIsIntroPaused(true);
        }, INTRO_PLAY_DURATION_MS);

        return () => window.clearTimeout(timer);
    }, []);

    return (
        <div className="home-page">
            <div className="home-intro-slot">
                <img
                    src={isIntroPaused ? cloudlockIntroLast : cloudlockIntro}
                    alt="CloudLock"
                    className="home-intro-gif"
                />
            </div>
            <div className="home-buttons">
                <div className="container">
                    <ActionButton
                        id="login-button"
                        className="home-action-button"
                        label="LOGIN"
                        to="/login"
                    />
                </div>
                <div className="container">
                    <ActionButton
                        id="signup-button"
                        className="home-action-button"
                        label="SIGNUP"
                        to="/signup"
                    />
                </div>
            </div>
        </div>
        
    );
}

export default HomePage;