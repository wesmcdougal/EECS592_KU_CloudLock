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
 * - Wesley McDougal - 09APR2026 - Refactored layout for mobile responsiveness, fixed header overlap, and improved WebAuthn-related UI feedback.
 * - Wesley McDougal - 29MAR2026 - Added local preview mode and header message placement updates
 */

import { useEffect, useState, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import eyeOpen from "../assets/eyeopen.png";
import eyeClose from "../assets/eyeclose.png";
import { AuthContext } from "../context/AuthContext";
import { saveVault, getVault } from "../api/vaultApi";
import { logout as apiLogout, deleteAccount as apiDeleteAccount } from "../api/authApi";
import { getMfaStatus } from "../api/mfaApi";
import { envelopeEncrypt } from "../crypto/envelopeEncrypt";
import { envelopeDecrypt } from "../crypto/envelopeDecrypt";
import {
    cacheEncryptedVault,
    loadCachedEncryptedVault,
    queueVaultOperation,
    loadVaultOpsQueue,
    clearVaultOpsQueue,
} from "../crypto/storageFormat";

import { generateStrongPassword } from "../crypto/passwordGenerator";
import { getPasswordStrength } from "../crypto/passwordStrength";

const MAX_CATEGORIES = 5;
const UNASSIGNED_CATEGORY_NAME = "Unassigned";

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
    const navigate = useNavigate();
    const displayUsername = location.state?.username || localStorage.getItem("cloudlock_username") || "User";
    const welcomeUsername = String(displayUsername).split("@")[0] || "User";

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
    const [mfaModalStep, setMfaModalStep] = useState("mfa");
    const [selectedEntityIndex, setSelectedEntityIndex] = useState(null);

    const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [deleteAccountMethods, setDeleteAccountMethods] = useState([]);
    const [deleteForm, setDeleteForm] = useState({
        email: "",
        password: "",
        method: "totp",
        totpCode: "",
        deviceId: "",
    });

    const [entities, setEntities] = useState([]);
    const [categories, setCategories] = useState([]);

    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategoryId, setSelectedCategoryId] = useState("");

    const [activeCategoryMenuId, setActiveCategoryMenuId] = useState("");

    const [updateFormData, setUpdateFormData] = useState({
        name: "",
        username: "",
        password: "",
        categoryIds: [],
    });

    const [showUpdatePassword, setShowUpdatePassword] = useState(false);
    const [showDetailsPassword, setShowDetailsPassword] = useState(false);
    const [tableVisiblePasswords, setTableVisiblePasswords] = useState({});
    const [departmentName, setDepartmentName] = useState("");
    const [departmentRows, setDepartmentRows] = useState([
        { rowId: 1, personName: "", username: "", password: "" },
    ]);
    const [departmentVisiblePasswords, setDepartmentVisiblePasswords] = useState({});

    const [isAddEntryModalOpen, setIsAddEntryModalOpen] = useState(false);
    const [addEntryTargetCategoryId, setAddEntryTargetCategoryId] = useState("");
    const [addEntryRows, setAddEntryRows] = useState([{ rowId: 1, personName: "", username: "", password: "" }]);
    const [addEntryVisiblePasswords, setAddEntryVisiblePasswords] = useState({});

    const isPreviewMode =
        import.meta.env.DEV &&
        import.meta.env.VITE_DEV_BYPASS_AUTH === "true" &&
        !masterKey;

    const query = searchTerm.trim().toLowerCase();

    const isUpdateFormValid =
        updateFormData.name.trim() &&
        updateFormData.username.trim() &&
        updateFormData.password.trim();
    const updatePasswordStrength = getPasswordStrength(updateFormData.password);

    const selectedCategory = selectedCategoryId
        ? categories.find((category) => category.id === selectedCategoryId) || null
        : null;

    const filteredEntities = entities.filter((entity) => {
        const matchesSearch =
            !query ||
            entity.name.toLowerCase().includes(query) ||
            entity.username.toLowerCase().includes(query);

        const entityCategoryRefs = entity.categoryIds || [];
        const matchesCategory =
            !selectedCategoryId ||
            entityCategoryRefs.includes(selectedCategoryId) ||
            (selectedCategory?.name
                ? entityCategoryRefs.includes(selectedCategory.name)
                : false);

        return matchesSearch && matchesCategory;
    });

    const searchResults = query
        ? entities.filter(
              (entity) =>
                  entity.name.toLowerCase().includes(query) ||
                  entity.username.toLowerCase().includes(query)
          )
        : [];

    function getEntityIndex(entity) {
        return entities.findIndex((candidate) =>
            candidate.name === entity.name &&
            candidate.username === entity.username &&
            candidate.password === entity.password &&
            JSON.stringify(candidate.categoryIds || []) ===
                JSON.stringify(entity.categoryIds || [])
        );
    }

    function handleSearchResultClick(entity) {
        const firstMatchingCategoryId = (entity.categoryIds || []).find((categoryId) =>
            categories.some((category) => category.id === categoryId)
        );

        setSelectedCategoryId(firstMatchingCategoryId || "");
        setSearchTerm("");
    }

    const selectedEntityName =
        selectedEntityIndex !== null
            ? entities[selectedEntityIndex]?.name || "this entity"
            : "this entity";

    const selectedEntity =
        selectedEntityIndex !== null ? entities[selectedEntityIndex] : null;

    const selectedCategoryName = selectedCategoryId
        ? categories.find((category) => category.id === selectedCategoryId)?.name || ""
        : "";

    const showSelectedCategoryTable =
        !!selectedCategoryId && selectedCategoryName !== UNASSIGNED_CATEGORY_NAME;

    const orderedCategories = [...categories].sort((left, right) => {
        const leftIsUnassigned = left.name === UNASSIGNED_CATEGORY_NAME;
        const rightIsUnassigned = right.name === UNASSIGNED_CATEGORY_NAME;

        if (leftIsUnassigned && !rightIsUnassigned) {
            return 1;
        }

        if (!leftIsUnassigned && rightIsUnassigned) {
            return -1;
        }

        return 0;
    });

    function handleToggleTablePassword(rowKey) {
        setTableVisiblePasswords((previous) => ({
            ...previous,
            [rowKey]: !previous[rowKey],
        }));
    }

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

        const categories = Array.isArray(data?.categories) ? data.categories : [];
        const categoryIdSet = new Set(
            categories.map((category) => category.id).filter(Boolean)
        );
        const categoryNameToId = new Map(
            categories
                .filter((category) => category?.name && category?.id)
                .map((category) => [category.name.trim().toLowerCase(), category.id])
        );

        function normalizeEntityCategoryRefs(categoryRefs = []) {
            const resolvedRefs = [];

            for (const ref of categoryRefs) {
                if (!ref) {
                    continue;
                }

                if (categoryIdSet.has(ref)) {
                    resolvedRefs.push(ref);
                    continue;
                }

                const mappedId = categoryNameToId.get(String(ref).trim().toLowerCase());
                if (mappedId) {
                    resolvedRefs.push(mappedId);
                }
            }

            return [...new Set(resolvedRefs)];
        }

        return {
            categories,
            entities: Array.isArray(data?.entities)
                ? data.entities.map((entity) => ({
                      ...entity,
                      categoryIds: normalizeEntityCategoryRefs(entity.categoryIds || []),
                  }))
                : [],
        };
    }

    function ensureUnassignedCategory(
        inputEntities = [],
        inputCategories = []
    ) {
        const categoriesCopy = [...(inputCategories || [])];
        let unassigned = categoriesCopy.find(
            (category) =>
                (category?.name || "").trim().toLowerCase() ===
                UNASSIGNED_CATEGORY_NAME.toLowerCase()
        );

        const needsUnassigned = (inputEntities || []).some(
            (entity) => !(entity?.categoryIds || []).length
        );

        if (!needsUnassigned) {
            return {
                categories: categoriesCopy,
                entities: [...(inputEntities || [])],
            };
        }

        if (!unassigned) {
            unassigned = {
                id: generateCategoryId(),
                name: UNASSIGNED_CATEGORY_NAME,
            };
            categoriesCopy.push(unassigned);
        }

        const normalizedEntities = (inputEntities || []).map((entity) => {
            const categoryIds = entity?.categoryIds || [];
            if (categoryIds.length > 0) {
                return entity;
            }

            return {
                ...entity,
                categoryIds: [unassigned.id],
            };
        });

        return {
            categories: categoriesCopy,
            entities: normalizedEntities,
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

    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Listen for online/offline events
    useEffect(() => {
        function handleOnline() {
            setIsOnline(true);
            processQueuedVaultOps();
        }
        function handleOffline() {
            setIsOnline(false);
        }
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
        // eslint-disable-next-line
    }, []);

    // Process queued vault operations when back online
    async function processQueuedVaultOps() {
        if (!masterKey) return;
        const queue = loadVaultOpsQueue();
        if (!queue.length) return;
        let currentEntities = [...entities];
        for (const op of queue) {
            if (op.type === 'add') {
                currentEntities.push(op.entity);
            } else if (op.type === 'update') {
                currentEntities[op.index] = op.entity;
            } else if (op.type === 'delete') {
                currentEntities.splice(op.index, 1);
            }
        }
        await handleSaveVault(currentEntities);
        clearVaultOpsQueue();
        setEntities(currentEntities);
    }

    function openModal() {
        setDepartmentName("");
        setDepartmentRows([{ rowId: 1, personName: "", username: "", password: "" }]);
        setDepartmentVisiblePasswords({});
        setIsModalOpen(true);
    }

    function closeModal() {
        setIsModalOpen(false);
        setDepartmentName("");
        setDepartmentRows([{ rowId: 1, personName: "", username: "", password: "" }]);
        setDepartmentVisiblePasswords({});
    }

    function handleToggleDepartmentRowPassword(rowId) {
        setDepartmentVisiblePasswords((previous) => ({
            ...previous,
            [rowId]: !previous[rowId],
        }));
    }

    function handleDepartmentRowChange(rowId, field, value) {
        setDepartmentRows((previous) =>
            previous.map((row) =>
                row.rowId === rowId ? { ...row, [field]: value } : row
            )
        );
    }

    function handleAddDepartmentRow() {
        setDepartmentRows((previous) => [
            ...previous,
            {
                rowId: Date.now() + Math.floor(Math.random() * 1000),
                personName: "",
                username: "",
                password: "",
            },
        ]);
    }

    function handleRemoveDepartmentRow(rowId) {
        setDepartmentRows((previous) => {
            if (previous.length === 1) {
                return previous;
            }
            return previous.filter((row) => row.rowId !== rowId);
        });
    }

    function handleGenerateDepartmentRowPassword(rowId) {
        const password = generateStrongPassword(14);
        setDepartmentRows((previous) =>
            previous.map((row) =>
                row.rowId === rowId ? { ...row, password } : row
            )
        );
    }

    async function handleCreateDepartmentBundle(event) {
        event.preventDefault();

        const trimmedDepartment = departmentName.trim();
        if (!trimmedDepartment) {
            setErrorMessage("Department name is required.");
            return;
        }

        if (trimmedDepartment.toLowerCase() === UNASSIGNED_CATEGORY_NAME.toLowerCase()) {
            setErrorMessage('"Unassigned" is reserved. Choose a different department name.');
            return;
        }

        const existingCategory = categories.find(
            (category) => category.name.toLowerCase() === trimmedDepartment.toLowerCase()
        );

        if (!existingCategory && categories.length >= MAX_CATEGORIES) {
            setErrorMessage("You can only have up to 5 categories.");
            return;
        }

        const activeRows = departmentRows.filter(
            (row) => row.personName.trim() || row.username.trim() || row.password.trim()
        );

        if (!activeRows.length) {
            setErrorMessage("Add at least one person/account row.");
            return;
        }

        const hasIncompleteRows = activeRows.some(
            (row) => !row.personName.trim() || !row.username.trim() || !row.password.trim()
        );
        if (hasIncompleteRows) {
            setErrorMessage("Each row must include person name, username, and password.");
            return;
        }

        const targetCategoryId = existingCategory?.id || generateCategoryId();
        const nextCategories = existingCategory
            ? categories
            : [...categories, { id: targetCategoryId, name: trimmedDepartment }];
        const bundleEntities = activeRows.map((row) => ({
            name: row.personName.trim(),
            username: row.username.trim(),
            password: row.password.trim(),
            categoryIds: [targetCategoryId],
        }));
        const nextEntities = [...entities, ...bundleEntities];

        setCategories(nextCategories);
        setEntities(nextEntities);
        setSelectedCategoryId(targetCategoryId);
        await handleSaveVault(nextEntities, nextCategories);
        setErrorMessage("");
        closeModal();
        setSelectedCategoryId(targetCategoryId);
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

    function openAddEntryModal(categoryId) {
        setAddEntryTargetCategoryId(categoryId);
        setAddEntryRows([{ rowId: Date.now(), personName: "", username: "", password: "" }]);
        setAddEntryVisiblePasswords({});
        setActiveCategoryMenuId("");
        setIsAddEntryModalOpen(true);
    }

    function closeAddEntryModal() {
        setIsAddEntryModalOpen(false);
        setAddEntryTargetCategoryId("");
        setAddEntryRows([{ rowId: 1, personName: "", username: "", password: "" }]);
        setAddEntryVisiblePasswords({});
    }

    function handleToggleAddEntryPassword(rowId) {
        setAddEntryVisiblePasswords((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
    }

    function handleAddEntryRowChange(rowId, field, value) {
        setAddEntryRows((prev) => prev.map((row) => row.rowId === rowId ? { ...row, [field]: value } : row));
    }

    function handleAddEntryAddRow() {
        setAddEntryRows((prev) => [
            ...prev,
            { rowId: Date.now() + Math.floor(Math.random() * 1000), personName: "", username: "", password: "" },
        ]);
    }

    function handleRemoveAddEntryRow(rowId) {
        setAddEntryRows((prev) => prev.length === 1 ? prev : prev.filter((row) => row.rowId !== rowId));
    }

    function handleGenerateAddEntryPassword(rowId) {
        const password = generateStrongPassword(14);
        setAddEntryRows((prev) => prev.map((row) => row.rowId === rowId ? { ...row, password } : row));
    }

    async function handleSubmitAddEntry(event) {
        event.preventDefault();
        const newEntities = addEntryRows.map((row) => ({
            name: row.personName.trim(),
            username: row.username.trim(),
            password: row.password.trim(),
            categoryIds: [addEntryTargetCategoryId],
        }));
        const nextEntities = [...entities, ...newEntities];
        setEntities(nextEntities);
        await handleSaveVault(nextEntities, categories);
        setErrorMessage("");
        closeAddEntryModal();
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

    function handleCategoryToggle(categoryId, isChecked) {
        setUpdateFormData((previous) => ({
            ...previous,
            categoryIds: isChecked
                ? [...new Set([...(previous.categoryIds || []), categoryId])]
                : (previous.categoryIds || []).filter((id) => id !== categoryId),
        }));
    }

    async function handleUpdateEntity(event) {
        event.preventDefault();

        if (selectedEntityIndex === null) {
            return;
        }

        if (!updateFormData.name || !updateFormData.username || !updateFormData.password) {
            return;
        }

        const draftEntities = entities.map((entity, index) =>
            index === selectedEntityIndex
                ? { ...updateFormData, categoryIds: updateFormData.categoryIds || [] }
                : entity
        );

        const normalized = ensureUnassignedCategory(draftEntities, categories);
        const nextEntities = normalized.entities;
        const nextCategories = normalized.categories;

        setCategories(nextCategories);
        setEntities(nextEntities);
        if (isOnline) {
            await handleSaveVault(nextEntities, nextCategories);
        } else {
            queueVaultOperation({
                type: "update",
                index: selectedEntityIndex,
                entity: nextEntities[selectedEntityIndex],
            });
        }
        closeMfaModal();
    }

    async function handleDeleteEntity() {
        if (selectedEntityIndex === null) {
            return;
        }

        const nextEntities = entities.filter((_, index) => index !== selectedEntityIndex);
        setEntities(nextEntities);
        if (isOnline) {
            await handleSaveVault(nextEntities);
        } else {
            queueVaultOperation({ type: 'delete', index: selectedEntityIndex });
        }
        closeMfaModal();
    }

    function openDeleteConfirmation() {
        setMfaModalStep("confirm-delete");
    }

    function handleGenerateUpdatePassword() {
        const password = generateStrongPassword(14);
        setUpdateFormData((previous) => ({
            ...previous,
            password,
        }));
    }

    async function handleRenameCategory(categoryId) {
        const categoryToRename = categories.find((category) => category.id === categoryId);

        if (!categoryToRename) {
            return;
        }

        const nextName = window.prompt("Enter a new name for this category:", categoryToRename.name);
        const trimmed = (nextName || "").trim();

        if (!trimmed || trimmed === categoryToRename.name) {
            return;
        }

        const duplicate = categories.some(
            (category) =>
                category.id !== categoryId &&
                category.name.toLowerCase() === trimmed.toLowerCase()
        );

        if (duplicate) {
            setErrorMessage("A category with that name already exists.");
            return;
        }

        const nextCategories = categories.map((category) =>
            category.id === categoryId
                ? { ...category, name: trimmed }
                : category
        );

        setCategories(nextCategories);
        setActiveCategoryMenuId("");
        setErrorMessage("");
        await handleSaveVault(entities, nextCategories);
    }

    async function handleDeleteCategory(categoryId) {
        const assignedEntities = entities.filter((entity) =>
            (entity.categoryIds || []).includes(categoryId)
        );
        const assignedCount = assignedEntities.length;

        if (assignedCount > 0) {
            const confirmed = window.confirm(
                `This category contains ${assignedCount} credential(s). Delete the category and permanently delete those credential(s)?`
            );

            if (!confirmed) {
                return;
            }
        }

        const draftCategories = categories.filter((category) => category.id !== categoryId);
        const draftEntities = entities.filter(
            (entity) => !(entity.categoryIds || []).includes(categoryId)
        );
        const normalized = ensureUnassignedCategory(draftEntities, draftCategories);
        const nextCategories = normalized.categories;
        const nextEntities = normalized.entities;

        if (selectedCategoryId === categoryId) {
            setSelectedCategoryId("");
        }

        if (activeCategoryMenuId === categoryId) {
            setActiveCategoryMenuId("");
        }

        setCategories(nextCategories);
        setEntities(nextEntities);
        await handleSaveVault(nextEntities, nextCategories);
    }

    function toggleCategoryMenu(categoryId) {
        setActiveCategoryMenuId((previous) =>
            previous === categoryId ? "" : categoryId
        );
    }

    useEffect(() => {
        if (!activeCategoryMenuId) {
            return undefined;
        }

        function handleOutsideMenuClick(event) {
            if (event.target.closest(".category-action-row")) {
                return;
            }
            setActiveCategoryMenuId("");
        }

        document.addEventListener("mousedown", handleOutsideMenuClick);
        return () => {
            document.removeEventListener("mousedown", handleOutsideMenuClick);
        };
    }, [activeCategoryMenuId]);

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
            // Cache encrypted envelope locally after successful save
            cacheEncryptedVault(envelope);
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
            let envelope;
            let online = true;
            try {
                envelope = await getVault();
            } catch (err) {
                online = false;
            }
            setShowSpinner(false);
            if (!online || !envelope) {
                // Offline or failed to fetch: try local cache
                envelope = loadCachedEncryptedVault();
                if (!envelope) {
                    setEntities([]);
                    setErrorMessage("No cached vault available offline.");
                    setRetryLoad(false);
                    setLoading(false);
                    return;
                }
            }
            if (envelope && envelope.status && [401,403,404,409,500,'timeout','error'].includes(envelope.status)) {
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
                // Cache envelope after successful online load
                if (online) cacheEncryptedVault(envelope);
                const decrypted = await envelopeDecrypt(envelope, masterKey);
                const normalized = normalizeVaultData(decrypted);
                const enforced = ensureUnassignedCategory(
                    normalized.entities,
                    normalized.categories
                );
                setCategories(enforced.categories);
                setEntities(enforced.entities);
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
        localStorage.removeItem("cloudlock_token");
        navigate("/");
    }

    async function openDeleteAccountModal() {
        setDeleteForm({
            email: "",
            password: "",
            method: "totp",
            totpCode: "",
            deviceId: "",
        });
        setDeleteAccountMethods([]);
        setIsDeleteAccountModalOpen(true);

        if (!token) {
            return;
        }

        const status = await getMfaStatus();
        if (status?.status) {
            return;
        }

        const methods = Array.isArray(status?.methods) ? status.methods : [];
        setDeleteAccountMethods(methods);
        if (methods.length > 0) {
            setDeleteForm((previous) => ({
                ...previous,
                method: methods[0],
            }));
        }
    }

    function closeDeleteAccountModal() {
        if (isDeletingAccount) {
            return;
        }

        setIsDeleteAccountModalOpen(false);
    }

    function handleDeleteInputChange(event) {
        const { name, value } = event.target;
        setDeleteForm((previous) => ({
            ...previous,
            [name]: value,
        }));
    }

    async function handleDeleteAccount() {
        if (isPreviewMode) {
            setErrorMessage("Delete account is disabled in preview mode.");
            setIsDeleteAccountModalOpen(false);
            return;
        }

        if (!deleteForm.email.trim() || !deleteForm.password.trim()) {
            setErrorMessage("Please enter your email and current password.");
            return;
        }

        if (!deleteForm.method) {
            setErrorMessage("No MFA method is available for this account.");
            return;
        }

        if (deleteForm.method === "totp" && deleteForm.totpCode.trim().length !== 6) {
            setErrorMessage("Please provide a valid 6-digit MFA code.");
            return;
        }

        if (deleteForm.method === "biometric" && !deleteForm.deviceId.trim()) {
            setErrorMessage("Please provide your registered device ID for biometric MFA.");
            return;
        }

        setIsDeletingAccount(true);
        setErrorMessage("");

        try {
            const response = await apiDeleteAccount({
                email: deleteForm.email.trim(),
                password: deleteForm.password,
                method: deleteForm.method,
                totpCode:
                    deleteForm.method === "totp" ? deleteForm.totpCode.trim() : null,
                deviceId:
                    deleteForm.method === "biometric" ? deleteForm.deviceId.trim() : null,
            });

            if (
                response &&
                response.status &&
                [401, 403, 404, 409, 500, "timeout", "error"].includes(response.status)
            ) {
                let msg = "";

                switch (response.status) {
                    case 401:
                        msg = "Session expired. Please log in again.";
                        break;
                    case 403:
                        msg = "Access denied. You do not have permission.";
                        break;
                    case 404:
                        msg = "Account was not found.";
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
                setIsDeletingAccount(false);
                return;
            }

            logout();
            localStorage.removeItem("username");
            localStorage.removeItem("password");
            localStorage.removeItem("cloudlock_token");
            navigate("/");
        } catch (e) {
            setErrorMessage("Account deletion failed: " + (e?.message || e));
            setIsDeletingAccount(false);
        }
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
                <div>Loading vault.</div>
            </div>
        );
    }

    return (
        <div className="main-page">
            <header className="main-header">
                <div className="main-header-left">
                    <nav className="main-logout-nav">
                        <div className="main-account-actions">
                            <button
                                type="button"
                                className="home-action-button"
                                data-label="LOGOUT"
                                aria-label="Logout"
                                onClick={clearStoredCredentials}
                            />
                            <button
                                type="button"
                                className="home-action-button delete-account-button"
                                data-label="DELETE ACCOUNT"
                                aria-label="Delete Account"
                                onClick={openDeleteAccountModal}
                                disabled={isPreviewMode || isDeletingAccount}
                            />
                            <span className="main-status-bar" style={{ color: isOnline ? 'green' : 'orange', fontWeight: 500 }}>
                                {isOnline ? 'Online' : 'Offline'}
                            </span>
                        </div>
                    </nav>
                </div>

                <div className="main-header-center">
                    <div className="main-title-group">
                        <h1 className="main-title">Welcome {welcomeUsername}</h1>
                        {isPreviewMode && (
                            <div className="preview-message">
                                Preview mode is enabled. Vault changes stay in local UI state only.
                            </div>
                        )}
                    </div>
                </div>

                <div className="main-header-right">
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
                            <section className="search-results-panel">
                                {searchResults.length > 0 ? (
                                    <ul className="search-results-list">
                                        {searchResults.map((entity, index) => {
                                            const categoryLabel =
                                                getCategoryNames(entity.categoryIds).join(", ") ||
                                                UNASSIGNED_CATEGORY_NAME;

                                            return (
                                                <li key={`${entity.name}-${entity.username}-result-${index}`}>
                                                    <button
                                                        type="button"
                                                        className="search-result-button"
                                                        onClick={() => handleSearchResultClick(entity)}
                                                        aria-label={`Open ${entity.name}`}
                                                    >
                                                        {entity.name} ({entity.username} - {categoryLabel})
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="search-results-empty">No matches found.</p>
                                )}
                            </section>
                        )}
                    </div>
                </div>
            </header>

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

            <div className="main-content">
                <div className="main-categories-column">
                    <h2 className="main-section-title">Categories</h2>

                    {orderedCategories.map((category) => (
                        <div key={category.id} className="category-action-row">
                            <button
                                type="button"
                                onClick={() => setSelectedCategoryId(category.id)}
                                className={`category-filter-button ${selectedCategoryId === category.id ? "category-filter-button-selected" : ""}`.trim()}
                            >
                                {category.name}
                            </button>

                            <button
                                type="button"
                                onClick={() => toggleCategoryMenu(category.id)}
                                aria-label={`Category settings for ${category.name}`}
                                className="category-settings-button"
                            >
                                ⚙
                            </button>

                            {activeCategoryMenuId === category.id && (
                                <div className="category-settings-menu" role="menu" aria-label={`Category actions for ${category.name}`}>
                                    <button
                                        type="button"
                                        className="category-settings-item"
                                        onClick={() => openAddEntryModal(category.id)}
                                    >
                                        Add Entry
                                    </button>
                                    <button
                                        type="button"
                                        className="category-settings-item"
                                        onClick={() => handleRenameCategory(category.id)}
                                    >
                                        Rename
                                    </button>
                                    <button
                                        type="button"
                                        className="category-settings-item category-settings-item-danger"
                                        onClick={() => handleDeleteCategory(category.id)}
                                    >
                                        Delete
                                    </button>
                                    <button
                                        type="button"
                                        className="category-settings-item"
                                        onClick={() => setActiveCategoryMenuId("")}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="main-entities-column">
                    <h2 className="main-section-title main-section-title-entities">
                        {selectedCategoryId ? selectedCategoryName || "Entities" : "Entities"}
                    </h2>

                    {selectedCategoryId ? (
                        filteredEntities.length > 0 ? (
                            showSelectedCategoryTable ? (
                                <div className="category-entity-table" role="table" aria-label="Category entities">
                                    <div className="category-entity-table-header" role="row">
                                        <span>Name</span>
                                        <span>Username</span>
                                        <span>Password</span>
                                        <span>Actions</span>
                                    </div>

                                    {filteredEntities.map((entity, index) => {
                                        const entityIndex = getEntityIndex(entity);
                                        const rowKey = entityIndex >= 0 ? entityIndex : `${entity.name}-${index}`;
                                        const isVisible = !!tableVisiblePasswords[rowKey];

                                        return (
                                            <div
                                                key={`${entity.name}-${entity.username}-table-${index}`}
                                                className="category-entity-table-row"
                                                role="row"
                                            >
                                                <span>{entity.name}</span>
                                                <span>{entity.username}</span>
                                                <div className="category-entity-password-cell">
                                                    <span className="category-entity-password-value">
                                                        {isVisible ? entity.password : "••••••••"}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="category-entity-visibility-button"
                                                        onClick={() => handleToggleTablePassword(rowKey)}
                                                        aria-label={isVisible ? "Hide password" : "Show password"}
                                                    >
                                                        <img
                                                            src={isVisible ? eyeClose : eyeOpen}
                                                            alt={isVisible ? "Hide password" : "Show password"}
                                                            className="password-toggle-icon"
                                                        />
                                                    </button>
                                                </div>
                                                <div className="category-entity-row-actions">
                                                    <button
                                                        type="button"
                                                        className="category-entity-row-button"
                                                        onClick={() => openMfaModal(entityIndex)}
                                                        aria-label={`Open ${entity.name}`}
                                                    >
                                                        View
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <ul className="entity-list">
                                    {filteredEntities.map((entity, index) => {
                                        const entityIndex = getEntityIndex(entity);

                                        return (
                                            <li
                                                key={`${entity.name}-${entity.username}-${index}`}
                                                className="entity-item"
                                            >
                                                <button
                                                    type="button"
                                                    className="action-button entity-button"
                                                    data-label={entity.name}
                                                    aria-label={`${entity.name} (${entity.username})`}
                                                    title={`Username: ${entity.username}`}
                                                    onClick={() => openMfaModal(entityIndex)}
                                                />
                                            </li>
                                        );
                                    })}
                                </ul>
                            )
                        ) : (
                            <p className="entity-empty-state">No entities in this view.</p>
                        )
                    ) : null}

                    <button
                        id="add-entity-button"
                        className="action-button main-add-button"
                        data-label="+"
                        aria-label="Add Entity"
                        onClick={openModal}
                    />
                </div>
            </div>

            {isModalOpen && (
                <div
                    className="entity-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Add category"
                >
                    <div className="entity-modal add-entry-modal">
                        <form onSubmit={handleCreateDepartmentBundle} style={{ width: "100%" }} autoComplete="off">
                            <h2>Add Category</h2>

                            <input
                                type="text"
                                name="category_name"
                                placeholder="Name of category"
                                value={departmentName}
                                autoComplete="off"
                                onChange={(event) => setDepartmentName(event.target.value)}
                                required
                            />

                            <div className="department-table" role="table" aria-label="Category members">
                                <div className="department-table-header" role="row">
                                    <span>Person Name</span>
                                    <span>Username</span>
                                    <span>Password</span>
                                    <span>Actions</span>
                                </div>

                                {departmentRows.map((row) => (
                                    <div key={row.rowId} className="department-table-row" role="row">
                                        <input
                                            type="text"
                                            name={`category_person_${row.rowId}`}
                                            placeholder="Person name"
                                            value={row.personName}
                                            autoComplete="off"
                                            onChange={(event) =>
                                                handleDepartmentRowChange(row.rowId, "personName", event.target.value)
                                            }
                                        />
                                        <input
                                            type="text"
                                            name={`category_account_username_${row.rowId}`}
                                            placeholder="Username"
                                            value={row.username}
                                            autoComplete="off"
                                            onChange={(event) =>
                                                handleDepartmentRowChange(row.rowId, "username", event.target.value)
                                            }
                                        />
                                        <div className="password-field department-password-field">
                                            <input
                                                type={departmentVisiblePasswords[row.rowId] ? "text" : "password"}
                                                name={`category_account_password_${row.rowId}`}
                                                placeholder="Password"
                                                value={row.password}
                                                autoComplete="new-password"
                                                onChange={(event) =>
                                                    handleDepartmentRowChange(row.rowId, "password", event.target.value)
                                                }
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={() => handleToggleDepartmentRowPassword(row.rowId)}
                                                aria-label={departmentVisiblePasswords[row.rowId] ? "Hide password" : "Show password"}
                                            >
                                                <img
                                                    src={departmentVisiblePasswords[row.rowId] ? eyeClose : eyeOpen}
                                                    alt={departmentVisiblePasswords[row.rowId] ? "Hide password" : "Show password"}
                                                    className="password-toggle-icon"
                                                />
                                            </button>
                                        </div>
                                        <div className="department-row-actions">
                                            <button
                                                type="button"
                                                className="department-row-button"
                                                onClick={() => handleGenerateDepartmentRowPassword(row.rowId)}
                                            >
                                                Generate
                                            </button>
                                            <button
                                                type="button"
                                                className="department-row-button"
                                                onClick={() => handleRemoveDepartmentRow(row.rowId)}
                                                disabled={departmentRows.length === 1}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="department-add-row-wrap">
                                <button type="button" className="department-row-button" onClick={handleAddDepartmentRow}>
                                    + Add Person
                                </button>
                            </div>

                            <div className="entity-modal-actions">
                                <button
                                    type="submit"
                                    className="action-button entity-modal-button"
                                    data-label="SAVE"
                                    aria-label="Save Category and Rows"
                                    disabled={!departmentName.trim()}
                                />
                                <button
                                    type="button"
                                    className="action-button entity-modal-button"
                                    data-label="CANCEL"
                                    aria-label="Cancel Add Category"
                                    onClick={closeModal}
                                />
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isAddEntryModalOpen && (
                <div
                    className="entity-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Add entry"
                >
                    <div className="entity-modal add-entry-modal">
                        <form onSubmit={handleSubmitAddEntry} style={{ width: "100%" }} autoComplete="off">
                            <h2>Add Entry</h2>

                            <div className="department-table" role="table" aria-label="New entries">
                                <div className="department-table-header" role="row">
                                    <span>Person Name</span>
                                    <span>Username</span>
                                    <span>Password</span>
                                    <span>Actions</span>
                                </div>

                                {addEntryRows.map((row) => (
                                    <div key={row.rowId} className="department-table-row" role="row">
                                        <input
                                            type="text"
                                            name={`add_entry_person_${row.rowId}`}
                                            placeholder="Person name"
                                            value={row.personName}
                                            autoComplete="off"
                                            onChange={(event) =>
                                                handleAddEntryRowChange(row.rowId, "personName", event.target.value)
                                            }
                                        />
                                        <input
                                            type="text"
                                            name={`add_entry_username_${row.rowId}`}
                                            placeholder="Username"
                                            value={row.username}
                                            autoComplete="off"
                                            onChange={(event) =>
                                                handleAddEntryRowChange(row.rowId, "username", event.target.value)
                                            }
                                        />
                                        <div className="password-field department-password-field">
                                            <input
                                                type={addEntryVisiblePasswords[row.rowId] ? "text" : "password"}
                                                name={`add_entry_password_${row.rowId}`}
                                                placeholder="Password"
                                                value={row.password}
                                                autoComplete="new-password"
                                                onChange={(event) =>
                                                    handleAddEntryRowChange(row.rowId, "password", event.target.value)
                                                }
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={() => handleToggleAddEntryPassword(row.rowId)}
                                                aria-label={addEntryVisiblePasswords[row.rowId] ? "Hide password" : "Show password"}
                                            >
                                                <img
                                                    src={addEntryVisiblePasswords[row.rowId] ? eyeClose : eyeOpen}
                                                    alt={addEntryVisiblePasswords[row.rowId] ? "Hide password" : "Show password"}
                                                    className="password-toggle-icon"
                                                />
                                            </button>
                                        </div>
                                        <div className="department-row-actions">
                                            <button
                                                type="button"
                                                className="department-row-button"
                                                onClick={() => handleGenerateAddEntryPassword(row.rowId)}
                                            >
                                                Generate
                                            </button>
                                            <button
                                                type="button"
                                                className="department-row-button"
                                                onClick={() => handleRemoveAddEntryRow(row.rowId)}
                                                disabled={addEntryRows.length === 1}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="department-add-row-wrap">
                                <button type="button" className="department-row-button" onClick={handleAddEntryAddRow}>
                                    + Add Person
                                </button>
                            </div>

                            <div className="entity-modal-actions">
                                <button
                                    type="submit"
                                    className="action-button entity-modal-button"
                                    data-label="ADD"
                                    aria-label="Add Entries"
                                    disabled={!addEntryRows.every(row => row.personName.trim() && row.username.trim() && row.password.trim())}
                                />
                                <button
                                    type="button"
                                    className="action-button entity-modal-button"
                                    data-label="CANCEL"
                                    aria-label="Cancel Add Entry"
                                    onClick={closeAddEntryModal}
                                />
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isMfaModalOpen && (
                <div className="entity-modal-backdrop" onClick={closeMfaModal}>
                    <div className="entity-modal" onClick={(event) => event.stopPropagation()}>
                        {mfaModalStep === "mfa" && (
                            <>
                                <h2>MFA Required</h2>
                                <p>MFA here</p>
                                <div className="entity-modal-actions">
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="CONTINUE"
                                        aria-label="Continue after MFA"
                                        onClick={showMfaActions}
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
                                                aria-label="Entity password"
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={() => setShowDetailsPassword((previous) => !previous)}
                                                aria-label={showDetailsPassword ? "Hide password" : "Show password"}
                                            >
                                                <img
                                                    src={showDetailsPassword ? eyeClose : eyeOpen}
                                                    alt={showDetailsPassword ? "Hide password" : "Show password"}
                                                    className="password-toggle-icon"
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {selectedEntity.categoryIds?.length > 0 && (
                                        <div>
                                            <strong>Categories:</strong>
                                            <div>{getCategoryNames(selectedEntity.categoryIds).join(", ")}</div>
                                        </div>
                                    )}
                                </div>

                                <div className="entity-modal-actions">
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="UPDATE"
                                        aria-label="Update Entity"
                                        onClick={openUpdateForm}
                                    />
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="DELETE"
                                        aria-label="Delete Entity"
                                        onClick={openDeleteConfirmation}
                                    />
                                </div>

                                <div className="entity-modal-actions">
                                    <button
                                        type="button"
                                        className="action-button entity-modal-button"
                                        data-label="CLOSE"
                                        aria-label="Close"
                                        onClick={closeMfaModal}
                                    />
                                </div>
                            </>
                        )}

                        {mfaModalStep === "confirm-delete" && (
                            <>
                                <h2>Delete Entity</h2>
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
                            <>
                                <h2>Update Entity</h2>

                                <form onSubmit={handleUpdateEntity} style={{ width: "100%" }}>
                                    <input
                                        type="text"
                                        name="name"
                                        placeholder="Name of organization"
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
                                                    className="category-checkbox-option"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={(updateFormData.categoryIds || []).includes(category.id)}
                                                        onChange={(event) =>
                                                            handleCategoryToggle(
                                                                category.id,
                                                                event.target.checked
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
                                            data-label="SAVE"
                                            aria-label="Save Updated Entity"
                                            disabled={!isUpdateFormValid}
                                        />
                                        <button
                                            type="button"
                                            className="action-button entity-modal-button"
                                            data-label="CANCEL"
                                            aria-label="Cancel Update"
                                            onClick={closeMfaModal}
                                        />
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}

            {isDeleteAccountModalOpen && (
                <div className="entity-modal-backdrop" onClick={closeDeleteAccountModal}>
                    <div className="entity-modal" onClick={(event) => event.stopPropagation()}>
                        <h2>Delete Account</h2>
                        <p>
                            This will permanently delete your account, vault data, sessions,
                            and registered devices.
                        </p>

                        <input
                            type="email"
                            name="email"
                            placeholder="Email"
                            value={deleteForm.email}
                            onChange={handleDeleteInputChange}
                            disabled={isDeletingAccount}
                            required
                        />

                        <input
                            type="password"
                            name="password"
                            placeholder="Current password"
                            value={deleteForm.password}
                            onChange={handleDeleteInputChange}
                            disabled={isDeletingAccount}
                            required
                        />

                        <select
                            name="method"
                            value={deleteForm.method}
                            onChange={handleDeleteInputChange}
                            disabled={isDeletingAccount || deleteAccountMethods.length === 0}
                            className="category-form-select"
                        >
                            {deleteAccountMethods.length === 0 ? (
                                <option value="">No MFA methods found</option>
                            ) : (
                                deleteAccountMethods.map((method) => (
                                    <option key={method} value={method}>
                                        {method.toUpperCase()}
                                    </option>
                                ))
                            )}
                        </select>

                        {deleteForm.method === "totp" && (
                            <input
                                type="text"
                                name="totpCode"
                                placeholder="6-digit MFA code"
                                value={deleteForm.totpCode}
                                onChange={handleDeleteInputChange}
                                maxLength={6}
                                disabled={isDeletingAccount}
                            />
                        )}

                        {deleteForm.method === "biometric" && (
                            <input
                                type="text"
                                name="deviceId"
                                placeholder="Registered device ID"
                                value={deleteForm.deviceId}
                                onChange={handleDeleteInputChange}
                                disabled={isDeletingAccount}
                            />
                        )}

                        <div className="entity-modal-actions">
                            <button
                                type="button"
                                className="action-button entity-modal-button"
                                data-label={isDeletingAccount ? "DELETING..." : "CONTINUE"}
                                aria-label="Continue Delete Account"
                                onClick={handleDeleteAccount}
                                disabled={isDeletingAccount}
                            />
                            <button
                                type="button"
                                className="action-button entity-modal-button"
                                data-label="CANCEL"
                                aria-label="Cancel Delete Account"
                                onClick={closeDeleteAccountModal}
                                disabled={isDeletingAccount}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MainPage;