/**
 * Final Authentication Step Component (FinalAuthStep.jsx)
 *
 * Renders the image-based final MFA step (FR24.5).
 * Responsibilities:
 * - File picker restricted to PNG only
 * - Preview thumbnail of selected image
 * - Client-side LSB extraction and SHA-256 hashing via imageAuth.js
 * - Submits only the derived hash to the server — never raw image bytes (FR24.6)
 * - Confirm button disabled until extraction succeeds
 *
 * Revision History:
 * - Added for FR24.2 / FR24.5 image MFA final auth step
 */

import { useState, useRef, useEffect } from "react";
import { extractAndHashSecret } from "../crypto/imageAuth";

export default function FinalAuthStep({ onConfirm, onCancel, isLoading, authError }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [extractionState, setExtractionState] = useState("idle"); // idle | extracting | ready | error
    const [extractedHash, setExtractedHash] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const fileInputRef = useRef(null);

    async function handleFileChange(event) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (file.type !== "image/png") {
            setErrorMessage("Only PNG images are accepted. Please select the exact PNG file you saved during registration.");
            setSelectedFile(null);
            setPreviewUrl(null);
            setExtractionState("error");
            setExtractedHash(null);
            return;
        }

        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setErrorMessage("");
        setExtractionState("extracting");
        setExtractedHash(null);

        try {
            const hash = await extractAndHashSecret(file);
            setExtractedHash(hash);
            setExtractionState("ready");
        } catch (err) {
            setErrorMessage(err.message || "Failed to process image. Ensure it is your original authentication PNG.");
            setExtractionState("error");
        }
    }

    // Auto-submit as soon as extraction succeeds — no manual Confirm step needed
    useEffect(() => {
        if (extractionState === "ready" && extractedHash) {
            onConfirm(extractedHash);
        }
    }, [extractionState, extractedHash]);

    // Reset local state when the parent reports an auth failure
    useEffect(() => {
        if (authError) {
            setExtractionState("error");
            setErrorMessage(authError);
            setExtractedHash(null);
            setSelectedFile(null);
            setPreviewUrl(null);
        }
    }, [authError]);

    return (
        <div className="final-auth-step">
            <h2 className="final-auth-title">Final Authentication</h2>
            <p className="final-auth-description">
                This login was detected from an unrecognised device or location.
                Please upload the PNG image you saved during registration to continue.
            </p>

            <div
                className="final-auth-dropzone"
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                aria-label="Select authentication image"
            >
                {previewUrl ? (
                    <img
                        src={previewUrl}
                        alt="Selected authentication image preview"
                        className="final-auth-preview"
                    />
                ) : (
                    <span className="final-auth-dropzone-hint">
                        Click to select your authentication PNG
                    </span>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                style={{ display: "none" }}
                onChange={handleFileChange}
                aria-label="Authentication image file input"
            />

            {selectedFile && (
                <p className="final-auth-filename">{selectedFile.name}</p>
            )}

            {extractionState === "extracting" && (
                <p className="final-auth-status">Verifying image…</p>
            )}

            {extractionState === "ready" && (
                <p className="final-auth-status final-auth-status-ready">{isLoading ? "Signing in…" : "Image verified."}</p>
            )}

            {errorMessage && (
                <p className="final-auth-error">{errorMessage}</p>
            )}

            <div className="final-auth-actions">
                <button
                    type="button"
                    className="action-button"
                    onClick={onCancel}
                    disabled={isLoading}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
