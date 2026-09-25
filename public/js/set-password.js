const token = new URLSearchParams(location.search).get("token");
const greeting = document.getElementById("invite-greeting");
const errorEl = document.getElementById("auth-error");
const form = document.getElementById("set-password-form");

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

async function init() {
  if (!token) {
    greeting.textContent = "";
    showError("No invitation token in the link. Check the URL your admin sent you.");
    return;
  }
  const res = await fetch(`/api/auth/invitation/${encodeURIComponent(token)}`);
  if (!res.ok) {
    greeting.textContent = "";
    showError("This invitation link is invalid or has expired. Ask your admin to send a new one.");
    return;
  }
  const invite = await res.json();
  greeting.textContent = `Welcome, ${invite.firstName} — set a password for ${invite.email} to activate your account.`;
  form.classList.remove("hidden");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");
  const password = document.getElementById("field-password").value;
  const confirm = document.getElementById("field-password-confirm").value;
  if (password !== confirm) {
    showError("Passwords don't match");
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const res = await fetch(`/api/auth/invitation/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error((body && body.error) || "Couldn't set your password");
    }
    location.href = "/index.html";
  } catch (err) {
    showError(err.message);
    submitBtn.disabled = false;
  }
});

init();
