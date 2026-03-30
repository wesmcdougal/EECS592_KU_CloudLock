/**
 * Main Vault Page (MainPage.jsx)
 *
 * Renders the primary credential management experience. Responsibilities include:
 * - Loading and decrypting encrypted vault records
 * - Managing add/update/delete flows for credential entities
 * - Handling search, modal state, category state, and update form interactions
 * - Persisting encrypted vault updates via backend APIs
 * - Providing local preview-mode data in development bypass mode
 *
 * Revision History:
 * - Wesley McDougal - 29MAR2026 - Added local preview mode and header message placement updates
 */

import { useEffect, useState, useContext } from "react";
import { Link, useLocation } from "react-router-dom";
import eyeOpen from "../assets/eyeopen.png";
import eyeClose from "../assets/eyeclose.png";
import { AuthContext } from "../context/AuthContext";
import { saveVault, getVault } from "../api/vaultApi";
import { logout as apiLogout } from "../api/authApi";
import { envelopeEncrypt } from "../crypto/envelopeEncrypt";
import { envelopeDecrypt } from "../crypto/envelopeDecrypt";
import { generateStrongPassword } from "../crypto/passwordGenerator";
import { getPasswordStrength } from "../crypto/passwordStrength";

const MAX_CATEGORIES = 5;

const previewVault = {
    categories: [
        { id: "cat-school", name: "School" },
        { id: "cat-work", name: "Work" },
    ],
    entities: [
        {
            name: "Github",
            username: "octocat",
            password: "preview-password-1",
            categoryIds: ["cat-work"],
        },
        {
            name: "University Portal",
            username: "student_demo",
            password: "preview-password-2",
            categoryIds: ["cat-school"],
        },
    ],
};

function MainPage() {
    const [showSpinner, setShowSpinner] = useState(false);
    const [retryLoad, setRetryLoad] = useState(false);
    const [retrySave, setRetrySave] = useState(false);
    const { masterKey, token, logout } = useContext(AuthContext);
    const location = useLocation();
    const displayUsername = location.state?.username || "User";

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
    const [mfaModalStep, setMfaModalStep] = useState("mfa");
    const [selectedEntityIndex, setSelectedEntityIndex] = useState(null);

    const [entities, setEntities] = useState([]);
    const [categories, setCategories] = useState([]);

    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategoryId, setSelectedCategoryId] = useState("");

    const [newCategoryName, setNewCategoryName] = useState("");
    const [renameCategoryId, setRenameCategoryId] = useState("");
    const [renameCategoryName, setRenameCategoryName] = useState("");

    const [formData, setFormData] = useState({
        name: "",
        username: "",
        password: "",
        categoryIds: [],
    });

    const [updateFormData, setUpdateFormData] = useState({
        name: "",
        username: "",
        password: "",
        categoryIds: [],
    });

    const [showAddPassword, setShowAddPassword] = useState(false);
    const [showUpdatePassword, setShowUpdatePassword] = useState(false);
    const [showDetailsPassword, setShowDetailsPassword] = useState(false);

    const isPreviewMode =
        import.meta.env.DEV &&
        import.meta.env.VITE_DEV_BYPASS_AUTH === "true" &&
        !masterKey;

    const query = searchTerm.trim().toLowerCase();

    const isAddFormValid =
        formData.name.trim() &&
        formData.username.trim() &&
        formData.password.trim();

    const addPasswordStrength = getPasswordStrength(formData.password);
    const updatePasswordStrength = getPasswordStrength(updateFormData.password);

    const filteredEntities = entities.filter((entity) => {
        const matchesSearch =
            !query ||
            entity.name.toLowerCase().includes(query) ||
            entity.username.toLowerCase().includes(query);

        const matchesCategory =
            !selectedCategoryId ||
            (entity.categoryIds || []).includes(selectedCategoryId);

        return matchesSearch && matchesCategory;
    });

    const searchResults = query ? filteredEntities : [];

    const selectedEntityName =
        selectedEntityIndex !== null
            ? entities[selectedEntityIndex]?.name || "this entity"
            : "this entity";

    const selectedEntity =
        selectedEntityIndex !== null ? entities[selectedEntityIndex] : null;

    function generateCategoryId() {
        return `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function normalizeVaultData(data) {
        if (Array.isArray(data)) {
            return {
                categories: [],
                entities: data.map((entity) => ({
                    ...entity,
                    categoryIds: entity.categoryIds || [],
                })),
            };
        }

        return {
            categories: Array.isArray(data?.categories) ? data.categories : [],
            entities: Array.isArray(data?.entities)
                ? data.entities.map((entity) => ({
                    ...entity,
                    categoryIds: entity.categoryIds || [],
                }))
                : [],
        };
    }

    function getCategoryNames(categoryIds = []) {
        if (!categoryIds.length) {
            return [];
        }

        return categories
            .filter((category) => categoryIds.includes(category.id))
            .map((category) => category.name);
    }

    function openModal() {
        setIsModalOpen(true);
    }

    function closeModal() {
        setIsModalOpen(false);
        setFormData({ name: "", username: "", password: "", categoryIds: [] });
        setShowAddPassword(false);
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
        setUpdateFormData({ name: "", username: "", password: "", categoryIds: [] });
        setShowUpdatePassword(false);
        setShowDetailsPassword(false);
    }

    function showMfaActions() {
        setMfaModalStep("details");
    }

    function openUpdateForm() {
        if (selectedEntityIndex === null) {
            return;
        }

        const selectedEntityValue = entities[selectedEntityIndex];

        if (!selectedEntityValue) {
            return;
        }

        setUpdateFormData({
            name: selectedEntityValue.name,
            username: selectedEntityValue.username,
            password: selectedEntityValue.password,
            categoryIds: selectedEntityValue.categoryIds || [],
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

    function handleInputChange(event) {
        const { name, value } = event.target;
        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    }

    function handleCategoryToggle(categoryId, isChecked, isUpdate = false) {
        if (isUpdate) {
            setUpdateFormData((previous) => ({
                ...previous,
                categoryIds: isChecked
                    ? [...new Set([...(previous.categoryIds || []), categoryId])]
                    : (previous.categoryIds || []).filter((id) => id !== categoryId),
            }));
            return;
        }

        setFormData((previous) => ({
            ...previous,
            categoryIds: isChecked
                ? [...new Set([...(previous.categoryIds || []), categoryId])]
                : (previous.categoryIds || []).filter((id) => id !== categoryId),
        }));
    }

    async function handleAddEntity(event) {
        event.preventDefault();

        if (!formData.name || !formData.username || !formData.password) {
            return;
        }

        const nextEntities = [
            ...entities,
            {
                ...formData,
                categoryIds: formData.categoryIds || [],
            },
        ];

        setEntities(nextEntities);
        await handleSaveVault(nextEntities, categories);
        closeModal();
    }

    async function handleUpdateEntity(event) {
        event.preventDefault();

        if (selectedEntityIndex === null) {
            return;
        }

        if (!updateFormData.name || !updateFormData.username || !updateFormData.password) {
            return;
        }

        const nextEntities = entities.map((entity, index) => (
            index === selectedEntityIndex
                ? { ...updateFormData, categoryIds: updateFormData.categoryIds || [] }
                : entity
        ));

        setEntities(nextEntities);
        await handleSaveVault(nextEntities, categories);
        closeMfaModal();
    }

    async function handleDeleteEntity() {
        if (selectedEntityIndex === null) {
            return;
        }

        const nextEntities = entities.filter((_, index) => index !== selectedEntityIndex);
        setEntities(nextEntities);
        await handleSaveVault(nextEntities, categories);
        closeMfaModal();
    }

    function openDeleteConfirmation() {
        setMfaModalStep("confirm-delete");
    }

    function handleGenerateAddPassword() {
        const password = generateStrongPassword(14);
        setFormData((previous) => ({
            ...previous,
            password,
        }));
    }

    function handleGenerateUpdatePassword() {
        const password = generateStrongPassword(14);
        setUpdateFormData((previous) => ({
            ...previous,
            password,
        }));
    }

    async function handleCreateCategory() {
        const trimmed = newCategoryName.trim();

        if (!trimmed) {
            return;
        }

        if (categories.length >= MAX_CATEGORIES) {
            setErrorMessage("You can only have up to 5 categories.");
            return;
        }

        const duplicate = categories.some(
            (category) => category.name.toLowerCase() === trimmed.toLowerCase()
        );

        if (duplicate) {
            setErrorMessage("A category with that name already exists.");
            return;
        }

        const nextCategories = [
            ...categories,
            { id: generateCategoryId(), name: trimmed },
        ];

        setCategories(nextCategories);
        setNewCategoryName("");
        setErrorMessage("");
        await handleSaveVault(entities, nextCategories);
    }

    async function handleRenameCategory() {
        const trimmed = renameCategoryName.trim();

        if (!renameCategoryId || !trimmed) {
            return;
        }

        const duplicate = categories.some(
            (category) =>
                category.id !== renameCategoryId &&
                category.name.toLowerCase() === trimmed.toLowerCase()
        );

        if (duplicate) {
            setErrorMessage("A category with that name already exists.");
            return;
        }

        const nextCategories = categories.map((category) =>
            category.id === renameCategoryId
                ? { ...category, name: trimmed }
                : category
        );

        setCategories(nextCategories);
        setRenameCategoryId("");
        setRenameCategoryName("");
        setErrorMessage("");
        await handleSaveVault(entities, nextCategories);
    }

    async function handleDeleteCategory(categoryId) {
        const assignedCount = entities.filter((entity) =>
            (entity.categoryIds || []).includes(categoryId)
        ).length;

        if (assignedCount > 0) {
            const confirmed = window.confirm(
                `This category is assigned to ${assignedCount} credential(s). Delete it and remove that assignment from those credentials?`
            );

            if (!confirmed) {
                return;
            }
        }

        const nextCategories = categories.filter((category) => category.id !== categoryId);
        const nextEntities = entities.map((entity) => ({
            ...entity,
            categoryIds: (entity.categoryIds || []).filter((id) => id !== categoryId),
        }));

        if (selectedCategoryId === categoryId) {
            setSelectedCategoryId("");
        }

        if (renameCategoryId === categoryId) {
            setRenameCategoryId("");
            setRenameCategoryName("");
        }

        setCategories(nextCategories);
        setEntities(nextEntities);
        await handleSaveVault(nextEntities, nextCategories);
    }

    async function handleSaveVault(
        updatedEntities = entities,
        updatedCategories = categories
    ) {
        if (!masterKey) {
            return;
        }

        setShowSpinner(true);

        try {
            const vaultPayload = {
                categories: updatedCategories,
                entities: updatedEntities,
            };

            const envelope = await envelopeEncrypt(vaultPayload, masterKey);
            const response = await saveVault(envelope);
            setShowSpinner(false);

            if (
                response &&
                response.status &&
                [401, 403, 409, 500, "timeout", "error"].includes(response.status)
            ) {
                let msg = "";

                switch (response.status) {
                    case 401:
                        msg = "Session expired. Please log in again.";
                        break;
                    case 403:
                        msg = "Access denied. You do not have permission.";
                        break;
                    case 409:
                        msg = "Conflict error. Please retry.";
                        break;
                    case 500:
                        msg = "Server error. Please try again later.";
                        break;
                    case "timeout":
                        msg = "Request timed out. Please retry.";
                        break;
                    case "error":
                        msg = response.error || "Unknown error.";
                        break;
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
            console.error("Vault save failed:", e);
        }
    }

    async function handleLoadVault() {
        if (!masterKey) {
            return;
        }

        setLoading(true);
        setShowSpinner(true);

        try {
            const envelope = await getVault();
            setShowSpinner(false);

            if (
                envelope &&
                envelope.status &&
                [401, 403, 404, 409, 500, "timeout", "error"].includes(envelope.status)
            ) {
                let msg = "";

                switch (envelope.status) {
                    case 401:
                        msg = "Session expired. Please log in again.";
                        break;
                    case 403:
                        msg = "Access denied. You do not have permission.";
                        break;
                    case 404:
                        setCategories([]);
                        setEntities([]);
                        setErrorMessage("");
                        setRetryLoad(false);
                        setLoading(false);
                        return;
                    case 409:
                        msg = "Conflict error. Please retry.";
                        break;
                    case 500:
                        msg = "Server error. Please try again later.";
                        break;
                    case "timeout":
                        msg = "Request timed out. Please retry.";
                        break;
                    case "error":
                        msg = envelope.error || "Unknown error.";
                        break;
                    default:
                        msg = "Unknown error.";
                }

                setErrorMessage(msg);
                setCategories([]);
                setEntities([]);
                setRetryLoad(true);
            } else if (envelope && envelope.encryptedData && envelope.encryptedDEK) {
                const decrypted = await envelopeDecrypt(envelope, masterKey);
                const normalized = normalizeVaultData(decrypted);
                setCategories(normalized.categories);
                setEntities(normalized.entities);
                setErrorMessage("");
                setRetryLoad(false);
            } else {
                setCategories([]);
                setEntities([]);
                setErrorMessage("");
                setRetryLoad(false);
            }
        } catch (e) {
            setShowSpinner(false);
            setCategories([]);
            setEntities([]);
            setErrorMessage("Vault load failed: " + (e?.message || e));
            setRetryLoad(true);
            console.error("Vault load failed:", e);
        }

        setLoading(false);
    }

    async function clearStoredCredentials() {
        if (masterKey) {
            await handleSaveVault(entities, categories);
        }

        apiLogout().catch(() => null);
        logout();
        localStorage.removeItem("username");
        localStorage.removeItem("password");
        localStorage.removeItem("cloudlock_token");
    }

    useEffect(() => {
        if (masterKey) {
            handleLoadVault();
            return;
        }

        if (isPreviewMode) {
            setCategories(previewVault.categories);
            setEntities(previewVault.entities);
            setErrorMessage("");
            setRetryLoad(false);
            setLoading(false);
            return;
        }

        setLoading(false);
        // eslint-disable-next-line
    }, [masterKey, token, isPreviewMode]);

    if (loading || showSpinner) {
        return (
            <div style={{ textAlign: "center", marginTop: 40 }}>
                <div
                    className="spinner"
                    style={{
                        margin: "20px auto",
                        width: 40,
                        height: 40,
                        border: "4px solid #ccc",
                        borderTop: "4px solid #333",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                    }}
                />
                <div>Loading vault...</div>
            </div>
        );
    }

    return (
        <div className="main-page">
            <header className="main-header">
                <nav className="main-logout-nav">
                    <ul>
                        <li>
                            <Link to="/" onClick={clearStoredCredentials}>
                                Logout
                            </Link>
                        </li>
                    </ul>
                </nav>

                <div className="main-title-group">
                    <h1 className="main-title">Welcome {displayUsername}</h1>
                    {isPreviewMode && (
                        <div className="preview-message">
                            Preview mode is enabled. Vault changes stay in local UI state only.
                        </div>
                    )}
                </div>

                {errorMessage && (
                    <div className="error-message" style={{ color: "red", margin: "8px 0" }}>
                        {errorMessage}
                        {retryLoad && (
                            <button
                                style={{ marginLeft: 8 }}
                                onClick={() => {
                                    setRetryLoad(false);
                                    handleLoadVault();
                                }}
                            >
                                Retry Load
                            </button>
                        )}
                        {retrySave && (
                            <button
                                style={{ marginLeft: 8 }}
                                onClick={() => {
                                    setRetrySave(false);
                                    handleSaveVault(entities, categories);
                                }}
                            >
                                Retry Save
                            </button>
                        )}
                    </div>
                )}

                <div className="main-search-area" style={{ marginTop: 12 }}>
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

            <div
                className="main-content"
                style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: 24,
                    padding: "0 24px 24px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        width: "100%",
                        maxWidth: "1100px",
                        minHeight: "500px",
                        background: "#fff",
                        border: "1px solid #d9d9d9",
                        borderRadius: 16,
                        overflow: "hidden",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
                    }}
                >
                    <aside
                        style={{
                            width: "300px",
                            borderRight: "1px solid #e5e5e5",
                            padding: 20,
                            display: "flex",
                            flexDirection: "column",
                            gap: 20,
                            background: "#fafafa",
                        }}
                    >
                        <section className="category-management">
                            <h2 style={{ marginTop: 0 }}>Categories</h2>

                            <div style={{ marginBottom: 12 }}>
                                <input
                                    type="text"
                                    placeholder="New category name"
                                    value={newCategoryName}
                                    onChange={(event) => setNewCategoryName(event.target.value)}
                                    aria-label="New category name"
                                    disabled={categories.length >= MAX_CATEGORIES}
                                    style={{ width: "100%" }}
                                />

                                <button
                                    type="button"
                                    style={{ marginTop: 8, width: "100%" }}
                                    onClick={handleCreateCategory}
                                    disabled={categories.length >= MAX_CATEGORIES}
                                >
                                    Create
                                </button>
                            </div>

                            {categories.length >= MAX_CATEGORIES && (
                                <p style={{ marginTop: 8 }}>
                                    Maximum of 5 categories reached.
                                </p>
                            )}

                            <div style={{ marginBottom: 12 }}>
                                <select
                                    value={renameCategoryId}
                                    onChange={(event) => setRenameCategoryId(event.target.value)}
                                    aria-label="Select category to rename"
                                    style={{ width: "100%" }}
                                >
                                    <option value="">Select category to rename</option>
                                    {categories.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>

                                <input
                                    type="text"
                                    placeholder="New name"
                                    value={renameCategoryName}
                                    onChange={(event) => setRenameCategoryName(event.target.value)}
                                    style={{ width: "100%", marginTop: 8 }}
                                    aria-label="Rename category"
                                />

                                <button
                                    type="button"
                                    style={{ marginTop: 8, width: "100%" }}
                                    onClick={handleRenameCategory}
                                >
                                    Rename
                                </button>
                            </div>
                        </section>

                        <section>
                            <h3 style={{ marginBottom: 12 }}>Browse</h3>

                            <button
                                type="button"
                                onClick={() => setSelectedCategoryId("")}
                                style={{
                                    display: "block",
                                    width: "100%",
                                    marginBottom: 8,
                                    padding: "10px 12px",
                                    textAlign: "left",
                                    borderRadius: 10,
                                    border: selectedCategoryId === "" ? "2px solid #333" : "1px solid #ccc",
                                    background: selectedCategoryId === "" ? "#f0f0f0" : "#fff",
                                    cursor: "pointer",
                                }}
                            >
                                All Categories
                            </button>

                            {categories.map((category) => (
                                <div
                                    key={category.id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        marginBottom: 8,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCategoryId(category.id)}
                                        style={{
                                            display: "block",
                                            flex: 1,
                                            marginBottom: 0,
                                            padding: "10px 12px",
                                            textAlign: "left",
                                            borderRadius: 10,
                                            border: selectedCategoryId === category.id ? "2px solid #333" : "1px solid #ccc",
                                            background: selectedCategoryId === category.id ? "#f0f0f0" : "#fff",
                                            cursor: "pointer",
                                        }}
                                    >
                                        {category.name}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleDeleteCategory(category.id)}
                                        aria-label={`Delete ${category.name}`}
                                        style={{
                                            padding: "10px 12px",
                                            borderRadius: 10,
                                            border: "1px solid #ccc",
                                            background: "#fff",
                                            cursor: "pointer",
                                        }}
                                    >
                                        X
                                    </button>
                                </div>
                            ))}
                        </section>
                    </aside>

                    <section
                        style={{
                            flex: 1,
                            padding: 24,
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 20,
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0 }}>
                                    {selectedCategoryId
                                        ? categories.find((category) => category.id === selectedCategoryId)?.name || "Entities"
                                        : "All Entities"}
                                </h2>
                                <p style={{ margin: "6px 0 0" }}>
                                    {filteredEntities.length} credential{filteredEntities.length === 1 ? "" : "s"}
                                </p>
                            </div>

                            <button
                                id="add-entity-button"
                                className="action-button main-add-button"
                                data-label="+"
                                aria-label="Add Entity"
                                onClick={openModal}
                            />
                        </div>

                        {filteredEntities.length > 0 ? (
                            <ul
                                className="entity-list"
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                                    gap: 16,
                                    listStyle: "none",
                                    padding: 0,
                                    margin: 0,
                                }}
                            >
                                {filteredEntities.map((entity, index) => {
                                    const entityIndex = entities.findIndex((candidate, candidateIndex) => (
                                        candidateIndex >= 0 &&
                                        candidate.name === entity.name &&
                                        candidate.username === entity.username &&
                                        candidate.password === entity.password &&
                                        JSON.stringify(candidate.categoryIds || []) === JSON.stringify(entity.categoryIds || [])
                                    ));

                                    const categoryNames = getCategoryNames(entity.categoryIds || []);

                                    return (
                                        <li
                                            key={`${entity.name}-${entity.username}-${index}`}
                                            className="entity-item"
                                            style={{
                                                border: "1px solid #e5e5e5",
                                                borderRadius: 14,
                                                padding: 16,
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                minHeight: 140,
                                                background: "#fff",
                                            }}
                                        >
                                            <button
                                                type="button"
                                                className="action-button entity-button"
                                                data-label={entity.name}
                                                aria-label={`${entity.name} (${entity.username})`}
                                                title={`Username: ${entity.username}`}
                                                onClick={() => openMfaModal(entityIndex)}
                                            />
                                            {categoryNames.length > 0 && (
                                                <small style={{ marginTop: 10, textAlign: "center" }}>
                                                    {categoryNames.join(", ")}
                                                </small>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div
                                style={{
                                    flex: 1,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: "1px dashed #ccc",
                                    borderRadius: 14,
                                    minHeight: 220,
                                }}
                            >
                                <p style={{ margin: 0 }}>No credentials found for this view.</p>
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {isModalOpen && (
                <div
                    className="entity-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Add entity"
                >
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

                        <div className="category-selector" style={{ marginBottom: 12 }}>
                            <p><strong>Categories</strong></p>
                            {categories.length > 0 ? (
                                categories.map((category) => (
                                    <label
                                        key={category.id}
                                        style={{ display: "block", marginBottom: 6 }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={(formData.categoryIds || []).includes(category.id)}
                                            onChange={(event) =>
                                                handleCategoryToggle(
                                                    category.id,
                                                    event.target.checked,
                                                    false
                                                )
                                            }
                                        />
                                        {" "}{category.name}
                                    </label>
                                ))
                            ) : (
                                <p>No categories yet.</p>
                            )}
                        </div>

                        <div className="password-field">
                            <input
                                type={showAddPassword ? "text" : "password"}
                                name="password"
                                placeholder="Password"
                                value={formData.password}
                                onChange={handleInputChange}
                                required
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowAddPassword((previous) => !previous)}
                                aria-label={showAddPassword ? "Hide password" : "Show password"}
                            >
                                <img
                                    src={showAddPassword ? eyeClose : eyeOpen}
                                    alt={showAddPassword ? "Hide password" : "Show password"}
                                    className="password-toggle-icon"
                                />
                            </button>
                        </div>

                        {formData.password && (
                            <p className="password-strength-text">
                                Password strength:
                                <span
                                    className={`strength-${addPasswordStrength.label.replace(/\s+/g, "").toLowerCase()}`}
                                >
                                    {" "}{addPasswordStrength.label}
                                </span>
                            </p>
                        )}

                        <div className="generate-button-container">
                            <button
                                type="button"
                                className="action-button"
                                onClick={handleGenerateAddPassword}
                            >
                                GENERATE?
                            </button>
                        </div>

                        <div className="entity-modal-actions">
                            <button
                                type="submit"
                                disabled={!isAddFormValid}
                                className="action-button entity-modal-button"
                                data-label="ADD"
                                aria-label="Add"
                            />
                            <button
                                type="button"
                                className="action-button entity-modal-button"
                                data-label="CANCEL"
                                aria-label="Cancel"
                                onClick={closeModal}
                            />
                        </div>
                    </form>
                </div>
            )}

            {isMfaModalOpen && (
                <div
                    className="entity-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-label="MFA placeholder"
                >
                    <div className="entity-modal" style={{ position: "relative" }}>
                        <button
                            type="button"
                            onClick={closeMfaModal}
                            aria-label="Close entity modal"
                            style={{
                                position: "absolute",
                                top: 12,
                                right: 12,
                                background: "transparent",
                                border: "none",
                                fontSize: 24,
                                cursor: "pointer",
                                lineHeight: 1,
                            }}
                        >
                            ×
                        </button>

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

                        {mfaModalStep === "details" && selectedEntity && (
                            <>
                                <h2>{selectedEntity.name}</h2>

                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 12,
                                        marginTop: 16,
                                    }}
                                >
                                    <div>
                                        <strong>Username:</strong>
                                        <div>{selectedEntity.username}</div>
                                    </div>

                                    <div>
                                        <strong>Password:</strong>
                                        <div className="password-field">
                                            <input
                                                type={showDetailsPassword ? "text" : "password"}
                                                value={selectedEntity.password}
                                                readOnly
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={() =>
                                                    setShowDetailsPassword((prev) => !prev)
                                                }
                                                aria-label={
                                                    showDetailsPassword
                                                        ? "Hide password"
                                                        : "Show password"
                                                }
                                            >
                                                <img
                                                    src={showDetailsPassword ? eyeClose : eyeOpen}
                                                    alt={
                                                        showDetailsPassword
                                                            ? "Hide password"
                                                            : "Show password"
                                                    }
                                                    className="password-toggle-icon"
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <strong>Categories:</strong>
                                        <div>
                                            {getCategoryNames(selectedEntity.categoryIds || []).length > 0
                                                ? getCategoryNames(selectedEntity.categoryIds || []).join(", ")
                                                : "None"}
                                        </div>
                                    </div>
                                </div>

                                <div className="entity-modal-actions" style={{ marginTop: 24 }}>
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

                                <div className="category-selector" style={{ marginBottom: 12 }}>
                                    <p><strong>Categories</strong></p>
                                    {categories.length > 0 ? (
                                        categories.map((category) => (
                                            <label
                                                key={category.id}
                                                style={{ display: "block", marginBottom: 6 }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={(updateFormData.categoryIds || []).includes(category.id)}
                                                    onChange={(event) =>
                                                        handleCategoryToggle(
                                                            category.id,
                                                            event.target.checked,
                                                            true
                                                        )
                                                    }
                                                />
                                                {" "}{category.name}
                                            </label>
                                        ))
                                    ) : (
                                        <p>No categories yet.</p>
                                    )}
                                </div>

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
                                        onClick={() =>
                                            setShowUpdatePassword((previous) => !previous)
                                        }
                                        aria-label={
                                            showUpdatePassword ? "Hide password" : "Show password"
                                        }
                                    >
                                        <img
                                            src={showUpdatePassword ? eyeClose : eyeOpen}
                                            alt={
                                                showUpdatePassword ? "Hide password" : "Show password"
                                            }
                                            className="password-toggle-icon"
                                        />
                                    </button>
                                </div>

                                {updateFormData.password && (
                                    <p className="password-strength-text">
                                        Password strength:
                                        <span
                                            className={`strength-${updatePasswordStrength.label.replace(/\s+/g, "").toLowerCase()}`}
                                        >
                                            {" "}{updatePasswordStrength.label}
                                        </span>
                                    </p>
                                )}

                                <div className="generate-button-container">
                                    <button
                                        type="button"
                                        className="action-button"
                                        onClick={handleGenerateUpdatePassword}
                                    >
                                        GENERATE?
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