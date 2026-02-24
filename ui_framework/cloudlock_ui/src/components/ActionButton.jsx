import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

function ActionButton({
  id,
  label,
  to,
  animated = false,
  className = "",
}) {
  const navigate = useNavigate();
  const [buttonState, setButtonState] = useState("");
  const timeoutsRef = useRef([]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  function queueTimeout(callback, delay) {
    const timeoutId = setTimeout(callback, delay);
    timeoutsRef.current.push(timeoutId);
  }

  function handleClick() {
    if (!animated) {
      navigate(to);
      return;
    }

    setButtonState("onclic");

    queueTimeout(() => {
      setButtonState("validate");
      navigate(to);
    }, 2250);

    queueTimeout(() => {
      setButtonState("");
    }, 3500);
  }

  return (
    <button
      id={id}
      className={`action-button ${buttonState} ${className}`.trim()}
      data-label={label}
      aria-label={label}
      type="button"
      onClick={handleClick}
    />
  );
}

export default ActionButton;