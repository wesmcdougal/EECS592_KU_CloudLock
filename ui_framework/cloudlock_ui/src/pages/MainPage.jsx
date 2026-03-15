import { useEffect, useState, useContext } from "react";
import { Link, useLocation } from "react-router-dom";
import eyeOpen from "../assets/eyeopen.png";
import eyeClose from "../assets/eyeclose.png";
import { AuthContext } from "../context/AuthContext";
import { saveVault, getVault } from "../api/vaultApi";
import { envelopeEncrypt } from "../crypto/envelopeEncrypt";
import { envelopeDecrypt } from "../crypto/envelopeDecrypt";


function MainPage() {
        const [showSpinner, setShowSpinner] = useState(false);
        const [retryLoad, setRetryLoad] = useState(false);
        const [retrySave, setRetrySave] = useState(false);
    const { masterKey, token } = useContext(AuthContext);
    const location = useLocation();
    const displayUsername = location.state?.username || "User";
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
    const [mfaModalStep, setMfaModalStep] = useState("mfa");
    const [selectedEntityIndex, setSelectedEntityIndex] = useState(null);
    const [entities, setEntities] = useState([]);
    // For loading state
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [formData, setFormData] = useState({
        name: "",
        username: "",
        password: "",
    });
    const [updateFormData, setUpdateFormData] = useState({
        name: "",
        username: "",
        password: "",
    });
    const [showUpdatePassword, setShowUpdatePassword] = useState(false);

    const query = searchTerm.trim().toLowerCase();
    const isAddFormValid =
        formData.name.trim() &&
        formData.username.trim() &&
        formData.password.trim();
    const searchResults = query
        ? entities.filter((entity) => (
            entity.name.toLowerCase().includes(query) ||
            entity.username.toLowerCase().includes(query)
        ))
        : [];
    const selectedEntityName = selectedEntityIndex !== null
        ? entities[selectedEntityIndex]?.name || "this entity"
        : "this entity";

    function openModal() {
        setIsModalOpen(true);
    }

    function closeModal() {
        setIsModalOpen(false);
        setFormData({ name: "", username: "", password: "" });
    }

    function openMfaModal(index) {
        setSelectedEntityIndex(index);
        setIsMfaModalOpen(true);
        setMfaModalStep("mfa");
    }

    function closeMfaModal() {
        setIsMfaModalOpen(false);
        setMfaModalStep("mfa");
        setSelectedEntityIndex(null);
        setUpdateFormData({ name: "", username: "", password: "" });
        setShowUpdatePassword(false);
    }

    function showMfaActions() {
        setMfaModalStep("actions");
    }

        const { logout } = useContext(AuthContext);
    function openUpdateForm() {
        if (selectedEntityIndex === null) {
            return;
        }

        const selectedEntity = entities[selectedEntityIndex];

        if (!selectedEntity) {
            return;
        }

        setUpdateFormData({
            name: selectedEntity.name,
            username: selectedEntity.username,
            password: selectedEntity.password,
        });
        setMfaModalStep("update");
    }

    function handleUpdateInputChange(event) {
        const { name, value } = event.target;
        setUpdateFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    }

    function handleUpdateEntity(event) {
        event.preventDefault();

        if (selectedEntityIndex === null) {
            return;
        }

        if (!updateFormData.name || !updateFormData.username || !updateFormData.password) {
            return;
        }

        setEntities((previous) => previous.map((entity, index) => (
            index === selectedEntityIndex ? { ...updateFormData } : entity
        )));
        closeMfaModal();
    }

    function handleDeleteEntity() {
        if (selectedEntityIndex === null) {
            return;
        }

        setEntities((previous) => previous.filter((_, index) => index !== selectedEntityIndex));
        closeMfaModal();
    }

    function openDeleteConfirmation() {
        setMfaModalStep("confirm-delete");
    }

    function handleInputChange(event) {
        const { name, value } = event.target;
        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    }

    function handleAddEntity(event) {
        event.preventDefault();
        if (!formData.name || !formData.username || !formData.password) {
            return;
        }
        setEntities((previous) => [...previous, formData]);
        closeModal();
    }

    // Save vault to backend (encrypted)
    async function handleSaveVault(updatedEntities) {
        if (!masterKey) return;
        setShowSpinner(true);
        try {
            const envelope = await envelopeEncrypt(updatedEntities, masterKey);
            const response = await saveVault(envelope);
            setShowSpinner(false);
            if (response && response.status && [401,403,409,500,'timeout','error'].includes(response.status)) {
                let msg = "";
                switch(response.status) {
                    case 401:
                        msg = "Session expired. Please log in again."; break;
                    case 403:
                        msg = "Access denied. You do not have permission."; break;
                    case 409:
                        msg = "Conflict error. Please retry."; break;
                    case 500:
                        msg = "Server error. Please try again later."; break;
                    case 'timeout':
                        msg = "Request timed out. Please retry."; break;
                    case 'error':
                        msg = response.error || "Unknown error."; break;
                    default:
                        msg = "Unknown error.";
                }
                setErrorMessage(msg);
                setRetrySave(true);
            } else {
                setErrorMessage("");
                setRetrySave(false);
            }
        } catch (e) {
            setShowSpinner(false);
            setErrorMessage("Vault save failed: " + (e?.message || e));
            setRetrySave(true);
            console.error('Vault save failed:', e);
        }
    }

    // Load vault from backend (decrypt)
    async function handleLoadVault() {
        if (!masterKey) return;
        setLoading(true);
        setShowSpinner(true);
        try {
            const envelope = await getVault();
            setShowSpinner(false);
            if (envelope && envelope.status && [401,403,409,500,'timeout','error'].includes(envelope.status)) {
                let msg = "";
                switch(envelope.status) {
                    case 401:
                        msg = "Session expired. Please log in again."; break;
                    case 403:
                        msg = "Access denied. You do not have permission."; break;
                    case 409:
                        msg = "Conflict error. Please retry."; break;
                    case 500:
                        msg = "Server error. Please try again later."; break;
                    case 'timeout':
                        msg = "Request timed out. Please retry."; break;
                    case 'error':
                        msg = envelope.error || "Unknown error."; break;
                    default:
                        msg = "Unknown error.";
                }
                setErrorMessage(msg);
                setEntities([]);
                setRetryLoad(true);
            } else if (envelope && envelope.encryptedData && envelope.encryptedDEK) {
                const data = await envelopeDecrypt(envelope, masterKey);
                setEntities(data);
                setErrorMessage("");
                setRetryLoad(false);
            } else {
                setEntities([]);
                setErrorMessage("");
                setRetryLoad(false);
            }
        } catch (e) {
            setShowSpinner(false);
            setEntities([]);
            setErrorMessage("Vault load failed: " + (e?.message || e));
            setRetryLoad(true);
            console.error('Vault load failed:', e);
        }
        setLoading(false);
    }

    function clearStoredCredentials() {
        localStorage.removeItem("username");
        localStorage.removeItem("password");
    }

    // Load vault on mount
    useEffect(() => {
        if (masterKey) {
            handleLoadVault();
        }
        // eslint-disable-next-line
    }, [masterKey, token]);

    // Save vault whenever entities change (except initial load)
    useEffect(() => {
        if (!loading && masterKey) {
            handleSaveVault(entities);
        }
        // eslint-disable-next-line
    }, [entities]);

    if (loading || showSpinner) {
        return (
            <div style={{ textAlign: 'center', marginTop: 40 }}>
                <div className="spinner" style={{ margin: '20px auto', width: 40, height: 40, border: '4px solid #ccc', borderTop: '4px solid #333', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <div>Loading vault...</div>
            </div>
        );
    }

    return (
        <div className="main-page">
            <header className="main-header">
                <nav className="main-logout-nav">
                    <ul>
                        <li><Link to="/" onClick={clearStoredCredentials}>Logout</Link></li>
                    </ul>
                </nav>
                <h1 className="main-title">Welcome {displayUsername}</h1>
                {errorMessage && (
                    <div className="error-message" style={{ color: 'red', margin: '8px 0' }}>{errorMessage}
                        {retryLoad && (
                            <button style={{ marginLeft: 8 }} onClick={() => { setRetryLoad(false); handleLoadVault(); }}>Retry Load</button>
                        )}
                        {retrySave && (
                            <button style={{ marginLeft: 8 }} onClick={() => { setRetrySave(false); handleSaveVault(entities); }}>Retry Save</button>
                        )}
                    </div>
                )}
                <div className="main-search-area">
                    <input
                        type="text"
                        className={`main-search-input ${query ? "main-search-input-open" : ""}`.trim()}
                        placeholder="Search entities"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        aria-label="Search entities"
                    />
                    {query && (
                        <section className="search-results-section">
                            {searchResults.length > 0 ? (
                                <ul className="search-results-list">
                                    {searchResults.map((entity, index) => (
                                        <li key={`${entity.name}-${entity.username}-result-${index}`}>
                                            {entity.name} ({entity.username})
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="search-results-empty">No matches found.</p>
                            )}
                        </section>
                    )}
                </div>
            </header>
            <div className="main-content">
                {entities.length > 0 && (
                    <ul className="entity-list">
                        {entities.map((entity, index) => (
                            <li key={`${entity.name}-${entity.username}-${index}`} className="entity-item">
                                <button
                                    type="button"
                                    className="action-button entity-button"
                                    data-label={entity.name}
                                    aria-label={`${entity.name} (${entity.username})`}
                                    title={`Username: ${entity.username}`}
                                    onClick={() => openMfaModal(index)}
                                >{entity.name}</button>
                            </li>
                        ))}
                    </ul>
                )}
                <button
                    id="add-entity-button"
                    className="action-button main-add-button"
                    data-label="ADD"
                    aria-label="Add Entity"
                    onClick={openModal}
                >Add Entity</button>
            </div>

            {isModalOpen && (
                <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="Add entity">
                    <div className="entity-modal">
                        <form onSubmit={handleAddEntity}>
                            <h2>Add Entity</h2>
                            <input
                                type="text"
                                name="name"
                                placeholder="Name"
                                value={formData.name}
                                onChange={handleInputChange}
                                required
                            />
                            <input
                                type="text"
                                name="username"
                                placeholder="Username"
                                value={formData.username}
                                onChange={handleInputChange}
                                required
                            />
                            <div className="password-field">
                                <input
                                    type="password"
                                    name="password"
                                    placeholder="Password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div className="entity-modal-actions">
                                <button
                                    type="submit"
                                    className="action-button entity-modal-button"
                                    data-label="ADD"
                                    aria-label="Add"
                                    disabled={!isAddFormValid}
                                >Add</button>
                                <button
                                    type="button"
                                    className="action-button entity-modal-button"
                                    data-label="CANCEL"
                                    aria-label="Cancel"
                                    onClick={closeModal}
                                >Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isMfaModalOpen && (
                <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="MFA placeholder">
                    <div className="entity-modal">
                        {mfaModalStep === "mfa" && (
                            <>
                                <h2>MFA Here</h2>
                                <div className="entity-modal-actions">
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="OK"
                                        aria-label="OK"
                                        onClick={showMfaActions}
                                    >OK</button>
                                </div>
                            </>
                        )}

                        {mfaModalStep === "actions" && (
                            <>
                                <h2>Choose Action</h2>
                                <div className="entity-modal-actions">
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="UPDATE"
                                        aria-label="Update"
                                        onClick={openUpdateForm}
                                    >Update</button>
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="DELETE"
                                        aria-label="Delete"
                                        onClick={openDeleteConfirmation}
                                    >Delete</button>
                                </div>
                            </>
                        )}

                        {mfaModalStep === "confirm-delete" && (
                            <>
                                <h2>Confirm Delete</h2>
                                <p>Are you sure you want to delete {selectedEntityName}?</p>
                                <div className="entity-modal-actions">
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="DELETE"
                                        aria-label="Confirm Delete"
                                        onClick={handleDeleteEntity}
                                    >Delete</button>
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="CANCEL"
                                        aria-label="Cancel"
                                        onClick={closeMfaModal}
                                    >Cancel</button>
                                </div>
                            </>
                        )}

                        {mfaModalStep === "update" && (
                            <form onSubmit={handleUpdateEntity}>
                                <h2>Update Entity</h2>
                                <input
                                    type="text"
                                    name="name"
                                    placeholder="Name"
                                    value={updateFormData.name}
                                    onChange={handleUpdateInputChange}
                                    required
                                />
                                <input
                                    type="text"
                                    name="username"
                                    placeholder="Username"
                                    value={updateFormData.username}
                                    onChange={handleUpdateInputChange}
                                    required
                                />
                                <div className="password-field">
                                    <input
                                        type={showUpdatePassword ? "text" : "password"}
                                        name="password"
                                        placeholder="Password"
                                        value={updateFormData.password}
                                        onChange={handleUpdateInputChange}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowUpdatePassword((previous) => !previous)}
                                        aria-label={showUpdatePassword ? "Hide password" : "Show password"}
                                    >
                                        <img
                                            src={showUpdatePassword ? eyeClose : eyeOpen}
                                            alt={showUpdatePassword ? "Hide password" : "Show password"}
                                            className="password-toggle-icon"
                                        />
                                    </button>
                                </div>
                                <div className="entity-modal-actions">
                                    <button
                                        type="submit"
                                        className="action-button entity-modal-button"
                                        data-label="UPDATE"
                                        aria-label="Update"
                                    >Update</button>
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="CANCEL"
                                        aria-label="Cancel"
                                        onClick={closeMfaModal}
                                    >Cancel</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MainPage;