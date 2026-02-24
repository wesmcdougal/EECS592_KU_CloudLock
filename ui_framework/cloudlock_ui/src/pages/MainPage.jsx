import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import eyeOpen from "../assets/eyeopen.png";
import eyeClose from "../assets/eyeclose.png";


function MainPage() {
    const location = useLocation();
    const displayUsername = location.state?.username || "User";
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
    const [mfaModalStep, setMfaModalStep] = useState("mfa");
    const [selectedEntityIndex, setSelectedEntityIndex] = useState(null);
    const [entities, setEntities] = useState([]);
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

    function clearStoredCredentials() {
        localStorage.removeItem("username");
        localStorage.removeItem("password");
    }

    useEffect(() => {
        return () => {
            clearStoredCredentials();
        };
    }, []);

    return (
        <div className="main-page">
            <header className="main-header">
                <nav className="main-logout-nav">
                    <ul>
                        <li><Link to="/" onClick={clearStoredCredentials}>Logout</Link></li>
                    </ul>
                </nav>
                <h1 className="main-title">Welcome {displayUsername}</h1>
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
                        <section className="search-results-panel" aria-live="polite">
                            <>
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
                            </>
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
                                />
                            </li>
                        ))}
                    </ul>
                )}

                <button
                    id="add-entity-button"
                    className="action-button main-add-button"
                    data-label="+"
                    aria-label="Add entity"
                    type="button"
                    onClick={openModal}
                />
            </div>

            {isModalOpen && (
                <div className="entity-modal-backdrop" role="dialog" aria-modal="true" aria-label="Add entity">
                    <form className="entity-modal" onSubmit={handleAddEntity}>
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
                        <input
                            type="password"
                            name="password"
                            placeholder="Password"
                            value={formData.password}
                            onChange={handleInputChange}
                            required
                        />

                        <div className="entity-modal-actions">
                            <button type="submit" disabled={!isAddFormValid} className="action-button entity-modal-button" data-label="ADD" aria-label="Add" />
                            <button type="button" className="action-button entity-modal-button" data-label="CANCEL" aria-label="Cancel" onClick={closeModal} />
                        </div>
                    </form>
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
                                    />
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
                                    />
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="DELETE"
                                        aria-label="Delete"
                                        onClick={openDeleteConfirmation}
                                    />
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
                                    />
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="CANCEL"
                                        aria-label="Cancel"
                                        onClick={closeMfaModal}
                                    />
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
                                    />
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="CANCEL"
                                        aria-label="Cancel"
                                        onClick={closeMfaModal}
                                    />
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