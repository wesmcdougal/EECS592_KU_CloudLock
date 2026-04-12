import React, { useState } from "react";

// Example: Key File MFA Enrollment and Verification
export default function KeyfileMfaDemo() {
  const [downloadUrl, setDownloadUrl] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [userId, setUserId] = useState("");
  const [file, setFile] = useState(null);

  // Enroll: Request key file from backend
  async function handleEnroll() {
    const res = await fetch("/api/mfa/keyfile/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (data.status === "success") {
      // Decode base64 and create a download link
      const blob = new Blob([Uint8Array.from(atob(data.message), c => c.charCodeAt(0))], { type: "application/octet-stream" });
      setDownloadUrl(URL.createObjectURL(blob));
    }
  }

  // Verify: Upload key file to backend
  async function handleVerify(e) {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", userId);
    const res = await fetch(`/api/mfa/keyfile/verify?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setVerifyResult(data.valid);
  }

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto", padding: 20, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>Key File MFA Demo</h2>
      <label>User ID: <input value={userId} onChange={e => setUserId(e.target.value)} /></label>
      <div style={{ margin: "1em 0" }}>
        <button onClick={handleEnroll}>Generate Key File</button>
        {downloadUrl && (
          <a href={downloadUrl} download="cloudlock.key" style={{ marginLeft: 10 }}>Download Key File</a>
        )}
      </div>
      <form onSubmit={handleVerify}>
        <input type="file" onChange={e => setFile(e.target.files[0])} />
        <button type="submit">Verify Key File</button>
      </form>
      {verifyResult !== null && (
        <div style={{ marginTop: 10 }}>
          {verifyResult ? <span style={{ color: "green" }}>Key file valid!</span> : <span style={{ color: "red" }}>Invalid key file.</span>}
        </div>
      )}
    </div>
  );
}
