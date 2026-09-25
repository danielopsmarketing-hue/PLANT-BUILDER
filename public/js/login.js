import { currentUser } from "./auth-guard.js";

const params = new URLSearchParams(location.search);
const redirect = params.get("redirect") || "/index.html";

// Already logged in? Skip the form.
currentUser().then((user) => {
  if (user) location.href = redirect;
});

const form = document.getElementById("login-form");
const errorEl = document.getElementById("auth-error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");
  const email = document.getElementById("field-email").value.trim();
  const password = document.getElementById("field-password").value;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error((body && body.error) || "Log in failed");
    }
    location.href = redirect;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
    submitBtn.disabled = false;
  }
});
