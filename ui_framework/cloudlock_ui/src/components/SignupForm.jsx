/**
 * Signup Form Component (SignupForm.jsx)
 *
 * Renders account creation UI and enrollment preferences. Responsibilities include:
 * - Collecting registration form input and validation state
 * - Password visibility and strength checks
 * - MFA enrollment option selection (biometric/TOTP)
 * - Signup API submission with MFA preferences
 * - WebAuthn credential enrollment during biometric setup
 *
 * Revision History:
 * - Wesley McDougal - 09APR2026 - Refactored MFA setup modal for better UX, added robust error handling for biometric and TOTP enrollment, clarified image authentication instructions, and improved WebAuthn fallback for Android.
 * - Wesley McDougal - 29MAR2026 - Added MFA setup modal and WebAuthn enrollment flow
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import eyeOpen from '../assets/eyeopen.png';
import eyeClose from '../assets/eyeclose.png';
import { signup } from '../api/authApi';
import { startTotpSetup, verifyTotpSetup } from '../api/mfaApi';
import { getWebAuthnRegistrationChallenge, triggerWebAuthnBrowserPrompt, submitWebAuthnCredential } from '../api/webauthnApi';
import { generateStrongPassword } from '../crypto/passwordGenerator';
import { getPasswordStrength } from '../crypto/passwordStrength';
import { embedSecretInImage, generateImageSecret } from '../crypto/imageAuth';
import { deriveMasterKeyRaw } from '../crypto/keyDerivation';
import RecoveryQrStep from './RecoveryQrStep';

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '', confirmPassword: '', recovery: '' });
  const [mfaEnrollment, setMfaEnrollment] = useState({
    enableBiometric: false,
    enableTotp: false,
    deviceLabel: '',
  });
  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const [biometricModal, setBiometricModal] = useState({ isOpen: false, deviceLabel: '', status: 'idle', error: '' });
  const [pendingBiometric, setPendingBiometric] = useState(null);
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [imageHash, setImageHash] = useState(null);
  const [imageError, setImageError] = useState('');
  const imageInputRef = useRef(null);
  const [pendingSignupNavigation, setPendingSignupNavigation] = useState(null);
  const [totpSetupState, setTotpSetupState] = useState({
    isOpen: false,
    setupToken: '',
    manualEntryKey: '',
    qrCodeDataUrl: '',
    totpCode: '',
    isVerifying: false,
    error: '',
  });
  const [recoveryQrState, setRecoveryQrState] = useState({
    isOpen: false,
    userId: null,
    masterKeyRaw: null,
    username: null,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitButtonState, setSubmitButtonState] = useState('');
  const timeoutsRef = useRef([]);
  const passwordsMatch = form.password === form.confirmPassword;
  const passwordStrength = getPasswordStrength(form.password);
  const emailValid = /^\S+@\S+\.\S+$/.test(form.email.trim());
  const usernameValid = form.username.trim().length > 0;
  const passwordValid = form.password.trim().length > 0 && passwordStrength.label === 'Very Strong';
  const confirmPasswordValid = form.confirmPassword.trim().length > 0 && passwordsMatch;
  const recoveryValid = form.recovery.trim().length > 0;
  const isFormValid = form.email.trim() && form.username.trim() && form.password.trim() && form.confirmPassword.trim() && passwordsMatch && passwordStrength.label === 'Very Strong' && !!imageHash;
  const [generatedPassword, setGeneratedPassword] = useState('');

  function handleGeneratePassword() {
    const pwGen = generateStrongPassword(14);
    setGeneratedPassword(pwGen);

    // Auto-fills password fields with generated password.
    setForm(prev => ({
      ...prev,
      password: pwGen,
      confirmPassword: pwGen,
    }));

    setMessage('');
  }

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  function queueTimeout(callback, delay) {
    const timeoutId = setTimeout(callback, delay);
    timeoutsRef.current.push(timeoutId);
  }

  function completeSignupNavigation(username) {
    setSubmitButtonState('validate');
    navigate('/login', {
      state: {
        signupSuccess: true,
        username,
      }
    });
  }

  function showRecoveryQr(userId, masterKeyRaw, username) {
    setRecoveryQrState({ isOpen: true, userId, masterKeyRaw, username });
  }

  async function beginTotpEnrollment(userId, accountName) {
    const setupResponse = await startTotpSetup({
      userId,
      accountName,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(setupResponse.otpauth_uri, {
      width: 220,
      margin: 1,
    });

    setTotpSetupState({
      isOpen: true,
      setupToken: setupResponse.setup_token,
      manualEntryKey: setupResponse.manual_entry_key,
      qrCodeDataUrl,
      totpCode: '',
      isVerifying: false,
      error: '',
    });
  }

  async function handleConfirmTotpSetup() {
    if (totpSetupState.totpCode.trim().length !== 6 || !pendingSignupNavigation) {
      return;
    }

    setTotpSetupState((previous) => ({
      ...previous,
      isVerifying: true,
      error: '',
    }));

    try {
      await verifyTotpSetup({
        setupToken: totpSetupState.setupToken,
        totpCode: totpSetupState.totpCode.trim(),
      });

      setTotpSetupState({
        isOpen: false,
        setupToken: '',
        manualEntryKey: '',
        qrCodeDataUrl: '',
        totpCode: '',
        isVerifying: false,
        error: '',
      });

      const { username, userId, masterKeyRaw } = pendingSignupNavigation;
      setPendingSignupNavigation(null);
      showRecoveryQr(userId, masterKeyRaw, username);
    } catch (err) {
      setTotpSetupState((previous) => ({
        ...previous,
        isVerifying: false,
        error: err?.message || String(err),
      }));
    }
  }

  async function handleBeginBiometricEnrollment() {
    setBiometricModal(prev => ({ ...prev, status: 'enrolling', error: '' }));
    try {
      const tentativeUserId = crypto.randomUUID();
      const challengeResponse = await getWebAuthnRegistrationChallenge(tentativeUserId);
      const credential = await triggerWebAuthnBrowserPrompt(challengeResponse, tentativeUserId);
      setPendingBiometric({ tentativeUserId, challengeResponse, credential });
      setBiometricModal(prev => ({ ...prev, status: 'enrolled', error: '' }));
    } catch (err) {
      setPendingBiometric(null);
      setBiometricModal(prev => ({ ...prev, status: 'error', error: err?.message || 'Biometric enrollment failed. Please try again.' }));
    }
  }

  async function handleImageSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png') {
      setImageError('Only PNG images are accepted for authentication.');
      setImageFile(null);
      setImagePreviewUrl(null);
      setImageHash(null);
      return;
    }

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setImageError('');
    setImageProcessing(true);
    setImageHash(null);

    try {
      const secret = generateImageSecret();
      const { modifiedBlob, secretHash } = await embedSecretInImage(file, secret);

      // Trigger download of the modified PNG for the user to save
      const downloadUrl = URL.createObjectURL(modifiedBlob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = 'cloudlock-auth.png';
      anchor.click();
      URL.revokeObjectURL(downloadUrl);

      setImageHash(secretHash);
      setImageProcessing(false);
    } catch (err) {
      setImageError(err.message || 'Failed to process image.');
      setImageProcessing(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.email.trim() || !form.username.trim() || !form.password.trim() || !form.confirmPassword.trim()) {
      setMessage('Please fill in all fields.');
      return;
    }

    if (!passwordsMatch) {
      setMessage('Password and Confirm Password must match exactly.');
      return;
    }

    setMessage('');
    setSubmitButtonState('onclic');

    try {
      const selectedMfaEnrollment = (mfaEnrollment.enableBiometric || mfaEnrollment.enableTotp)
        ? {
            enable_biometric: mfaEnrollment.enableBiometric,
            enable_totp: mfaEnrollment.enableTotp,
            device_label: mfaEnrollment.deviceLabel.trim() || null,
          }
        : null;

      // Step 1: Create the account.
      // If biometric is enabled, the credential was already captured via the enrollment sub-modal.
      // Pass the tentative user ID so the server uses the same UUID that the WebAuthn challenge was issued for.
      const response = await signup({
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim(),
        authImageId: imageHash || 'img_001',
        mfaEnrollment: selectedMfaEnrollment,
        proposedUserId: pendingBiometric?.tentativeUserId || null,
      });

      if (response?.user_id) {
        localStorage.setItem("cloudlock_username", form.username.trim());

        // Derive the master key raw bytes for the recovery QR (client-side only, never sent to server).
        const masterKeyRaw = await deriveMasterKeyRaw(form.password, form.email.trim().toLowerCase());

        // Step 2: Submit the already-captured WebAuthn credential to the backend.
        if (mfaEnrollment.enableBiometric && pendingBiometric) {
          try {
            await submitWebAuthnCredential(
              pendingBiometric.credential,
              pendingBiometric.challengeResponse,
              mfaEnrollment.deviceLabel.trim() || 'My Device'
            );
          } catch (webauthnError) {
            console.error('WebAuthn credential registration failed:', webauthnError);
            setSubmitButtonState('');
            setMessage('Biometric enrollment failed during registration. Account was created but biometric is not active.');
            return;
          }
        }

        if (mfaEnrollment.enableTotp) {
          setPendingSignupNavigation({ username: form.username.trim(), userId: response.user_id, masterKeyRaw });
          try {
            await beginTotpEnrollment(response.user_id, form.email.trim().toLowerCase());
            return;
          } catch (totpError) {
            console.error('TOTP enrollment setup failed:', totpError);
            setSubmitButtonState('');
            setMessage('Authenticator app setup could not be started. Signup cannot continue with Auth App MFA enabled until setup is available.');
            return;
          }
        }

        showRecoveryQr(response.user_id, masterKeyRaw, form.username.trim());
      } else {
        setMessage(response?.error || "Signup failed. Please try again.");
        setSubmitButtonState('');
      }
    } catch (err) {
      setMessage("Signup error: " + (err?.message || err));
      setSubmitButtonState('');
    }
  }


  return (
    <form onSubmit={handleSubmit}>
    <div className='signup-form'>

      {message && (
        <p className="error-message">{message}</p>
      )}

      <div className={`signup-input-row ${emailValid ? 'is-valid' : ''}`.trim()}>
        <span className="signup-field-check" aria-hidden="true">✓</span>
        <input 
          type="email"
          placeholder="Email Address"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
        />
      </div>
      
      <div className={`signup-input-row ${usernameValid ? 'is-valid' : ''}`.trim()}>
        <span className="signup-field-check" aria-hidden="true">✓</span>
        <input 
          type="text"
          placeholder="Username"
          value={form.username}
          onChange={e => setForm({ ...form, username: e.target.value })}
        />
      </div>

      <div className={`signup-input-row ${passwordValid ? 'is-valid' : ''}`.trim()}>
        <span className="signup-field-check" aria-hidden="true">✓</span>
        <div className="password-field">
          <input 
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(prev => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            <img
              src={showPassword ? eyeClose : eyeOpen}
              alt={showPassword ? "Hide password" : "Show password"}
              className="password-toggle-icon"
            />
          </button>
        </div>
      </div>

      <div className={`signup-input-row ${confirmPasswordValid ? 'is-valid' : ''}`.trim()}>
        <span className="signup-field-check" aria-hidden="true">✓</span>
        <div className="password-field">
          <input 
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Confirm Password"
            value={form.confirmPassword}
            onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowConfirmPassword(prev => !prev)}
            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
          >
            <img
              src={showConfirmPassword ? eyeClose : eyeOpen}
              alt={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              className="password-toggle-icon"
            />
          </button>
        </div>
      </div>

      {form.password && (
        <>
          <p className="password-strength-text">
            Password strength: 
            <span className={`strength-${passwordStrength.label.replace(/\s+/g, '').toLowerCase()}`}>
              {" "}{passwordStrength.label}
            </span>
          </p>

          {passwordStrength.label !== 'Very Strong' && (
            <p className="password-strength-warning">
              Password must be <span className="strength-verystrong">Very Strong</span> to sign up. Try upper, lower, numbers, symbols, and avoid dictionary words.
            </p>
          )}
        </>
      )}

      <div className="generate-button-container">
      <button
        type="button"
        className="action-button"
        style={{ width: 'auto', padding: '0 20px' }}
        onClick={handleGeneratePassword}
      >
        GENERATE STRONG PASSWORD
      </button>
      </div>

      <div className="generate-button-container">
        <button
          type="button"
          className={`action-button${imageHash ? ' mfa-option-selected' : ''}`}
          style={{ width: 'auto', padding: '0 20px' }}
          onClick={() => setIsMfaModalOpen(true)}
        >
          {imageHash ? 'MFA CONFIGURED ✓' : 'SET UP MFA'}
        </button>
      </div>

      <button
        type="submit"
        disabled={!isFormValid}
        className={`action-button signup-submit-button ${submitButtonState}`.trim()}
        data-label="SIGN UP"
        aria-label="Sign Up"
      />
    </div>

    {isMfaModalOpen && (
      <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="MFA setup">
        <div className="entity-modal">
          <h2>MFA Setup</h2>
          <p>Choose at least one method to enroll after signup.</p>

          <div className="mfa-option-actions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className={`action-button entity-modal-button mfa-option-button ${mfaEnrollment.enableBiometric ? 'mfa-option-selected' : ''}`.trim()}
                data-label={mfaEnrollment.enableBiometric ? 'BIOMETRIC ON ✓' : 'BIOMETRIC OFF'}
                aria-label="Toggle biometric MFA enrollment"
                aria-pressed={mfaEnrollment.enableBiometric}
                onClick={() => {
                  if (!mfaEnrollment.enableBiometric) {
                    setBiometricModal({ isOpen: true, deviceLabel: '', status: 'idle', error: '' });
                    setPendingBiometric(null);
                  } else {
                    setMfaEnrollment(prev => ({ ...prev, enableBiometric: false, deviceLabel: '' }));
                    setPendingBiometric(null);
                  }
                }}
              />
            </div>
            <button
              type="button"
              className={`action-button entity-modal-button mfa-option-button ${mfaEnrollment.enableTotp ? 'mfa-option-selected' : ''}`.trim()}
              data-label={mfaEnrollment.enableTotp ? 'AUTH APP ON' : 'AUTH APP OFF'}
              aria-label="Toggle authenticator app MFA enrollment"
              aria-pressed={mfaEnrollment.enableTotp}
              onClick={() => setMfaEnrollment((previous) => ({
                ...previous,
                enableTotp: !previous.enableTotp,
              }))}
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #3a3a3a', margin: '8px 0' }} />

          <div className="image-auth-section">
            <p className="image-auth-label">Authentication Image <span style={{ color: '#e05252' }}>*required</span></p>
            <p className="image-auth-hint">
              Upload any PNG. A secret will be embedded and the modified file will download
              automatically — save it securely. You&#39;ll need it on unrecognised logins.
            </p>
            <div
              className={`final-auth-dropzone image-auth-dropzone${imageHash ? ' has-image' : ''}`}
              onClick={() => imageInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') imageInputRef.current?.click(); }}
              aria-label="Select authentication image"
            >
              {imagePreviewUrl ? (
                <img src={imagePreviewUrl} alt="Authentication image preview" className="final-auth-preview" />
              ) : (
                <span className="final-auth-dropzone-hint">Click to select a PNG image</span>
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png"
              style={{ display: 'none' }}
              onChange={handleImageSelect}
              aria-label="Authentication image file input"
            />
            {imageProcessing && <p className="final-auth-status">Processing image…</p>}
            {imageHash && !imageProcessing && (
              <p className="final-auth-status ready">✓ Image ready — modified PNG downloaded. Save it securely.</p>
            )}
            {imageError && <p className="final-auth-status error">{imageError}</p>}
          </div>

          <div className="entity-modal-actions">
            <button
              type="button"
              className="action-button entity-modal-button"
              data-label="SAVE"
              aria-label="Save MFA Setup"
              disabled={!(mfaEnrollment.enableBiometric || mfaEnrollment.enableTotp) || !imageHash}
              onClick={() => setIsMfaModalOpen(false)}
            />
            <button
              type="button"
              className="action-button entity-modal-button"
              data-label="CANCEL"
              aria-label="Cancel MFA Setup"
              onClick={() => setIsMfaModalOpen(false)}
            />
          </div>
        </div>
      </div>
    )}

    {biometricModal.isOpen && (
      <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="Biometric enrollment">
        <div className="entity-modal">
          <h2>Biometric Enrollment</h2>
          <p>Give this device a label, then tap the button below to register your fingerprint, face, or platform authenticator.</p>

          <input
            type="text"
            placeholder="Device label (e.g. My Android, MacBook Pro)"
            value={biometricModal.deviceLabel}
            onChange={(e) => setBiometricModal(prev => ({ ...prev, deviceLabel: e.target.value }))}
            disabled={biometricModal.status === 'enrolling' || biometricModal.status === 'enrolled'}
          />

          <button
            type="button"
            className="action-button entity-modal-button"
            data-label={
              biometricModal.status === 'enrolling' ? 'ENROLLING...' :
              biometricModal.status === 'enrolled' ? 'ENROLLED ✓' :
              'BEGIN ENROLLMENT'
            }
            aria-label="Begin biometric enrollment"
            disabled={biometricModal.status === 'enrolling' || biometricModal.status === 'enrolled'}
            onClick={handleBeginBiometricEnrollment}
          />

          {biometricModal.error && (
            <p className="error-message">{biometricModal.error}</p>
          )}

          <div className="entity-modal-actions">
            <button
              type="button"
              className="action-button entity-modal-button"
              data-label="SAVE"
              aria-label="Save biometric enrollment"
              disabled={biometricModal.status !== 'enrolled'}
              onClick={() => {
                setMfaEnrollment(prev => ({ ...prev, enableBiometric: true, deviceLabel: biometricModal.deviceLabel.trim() || 'My Device' }));
                setBiometricModal(prev => ({ ...prev, isOpen: false }));
              }}
            />
            <button
              type="button"
              className="action-button entity-modal-button"
              data-label="CANCEL"
              aria-label="Cancel biometric enrollment"
              disabled={biometricModal.status === 'enrolling'}
              onClick={() => {
                setBiometricModal({ isOpen: false, deviceLabel: '', status: 'idle', error: '' });
                setPendingBiometric(null);
              }}
            />
          </div>
        </div>
      </div>
    )}

    {totpSetupState.isOpen && (
      <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="Authenticator app setup">
        <div className="entity-modal">
          <h2>Set Up Authenticator App</h2>
          <p>Scan this QR code with Google Authenticator, Microsoft Authenticator, Authy, 1Password, or a compatible app.</p>

          {totpSetupState.qrCodeDataUrl && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <img src={totpSetupState.qrCodeDataUrl} alt="Authenticator app QR code" style={{ width: '220px', height: '220px', background: '#fff', padding: '8px', borderRadius: '8px' }} />
            </div>
          )}

          <p style={{ wordBreak: 'break-all', fontSize: '0.9rem' }}>
            Manual setup key: <strong>{totpSetupState.manualEntryKey}</strong>
          </p>

          <input
            type="text"
            placeholder="Enter 6-digit code from your app"
            value={totpSetupState.totpCode}
            onChange={(event) => setTotpSetupState((previous) => ({
              ...previous,
              totpCode: event.target.value,
            }))}
            maxLength={6}
            disabled={totpSetupState.isVerifying}
          />

          {totpSetupState.error && (
            <p className="error-message">{totpSetupState.error}</p>
          )}

          <div className="entity-modal-actions">
            <button
              type="button"
              className="action-button entity-modal-button"
              data-label={totpSetupState.isVerifying ? 'VERIFYING...' : 'VERIFY APP'}
              aria-label="Verify authenticator app"
              disabled={totpSetupState.isVerifying || totpSetupState.totpCode.trim().length !== 6}
              onClick={handleConfirmTotpSetup}
            />
            <button
              type="button"
              className="action-button entity-modal-button"
              data-label="CANCEL"
              aria-label="Cancel authenticator app setup"
              disabled={totpSetupState.isVerifying}
              onClick={() => {
                setTotpSetupState({
                  isOpen: false,
                  setupToken: '',
                  manualEntryKey: '',
                  qrCodeDataUrl: '',
                  totpCode: '',
                  isVerifying: false,
                  error: '',
                });
                setPendingSignupNavigation(null);
                setSubmitButtonState('');
                setMessage('Authenticator app setup is required because Auth App MFA is enabled. Complete verification to finish signup.');
              }}
            />
          </div>
        </div>
      </div>
    )}
    {recoveryQrState.isOpen && (
      <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="Recovery QR code">
        <div className="entity-modal">
          <RecoveryQrStep
            userId={recoveryQrState.userId}
            masterKeyRaw={recoveryQrState.masterKeyRaw}
            onComplete={() => {
              setRecoveryQrState({ isOpen: false, userId: null, masterKeyRaw: null, username: null });
              completeSignupNavigation(recoveryQrState.username);
            }}
          />
        </div>
      </div>
    )}
    </form>
  );
}