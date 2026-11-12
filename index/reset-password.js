document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const client = typeof supabaseClient !== "undefined" ? supabaseClient : null;
  const form = $("reset-form");
  let ready = false;

  function showMessage(message, type = "error") {
    $("form-message").textContent = message;
    $("form-message").className = `form-message show ${type}`;
  }

  function allowReset() {
    if (ready) return;
    ready = true;
    $("reset-subtitle").textContent = "Choose a new password for your account.";
    form.classList.remove("hidden");
    $("new-password").focus();
  }

  $("theme-toggle").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  });

  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", () => {
      const field = $(button.dataset.target);
      const show = field.type === "password";
      field.type = show ? "text" : "password";
      button.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });
  });

  if (!client) {
    $("reset-subtitle").textContent = "Something went wrong.";
    return showMessage("Supabase config was not loaded.");
  }

  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" || session) allowReset();
  });

  setTimeout(async () => {
    const { data } = await client.auth.getSession();
    if (data.session) return allowReset();
    $("reset-subtitle").textContent = "This reset link is invalid or has expired.";
    showMessage("Go back to the login page, type your email and press Forgot password? to get a new link.");
  }, 1500);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("new-password").value;
    if (password.length < 6) return showMessage("Your password needs at least 6 characters.");
    if (password !== $("confirm-password").value) return showMessage("The passwords don't match.");

    $("reset-submit").disabled = true;
    const { error } = await client.auth.updateUser({ password });
    $("reset-submit").disabled = false;
    if (error) return showMessage(error.message || "Couldn't update your password. Try again.");

    showMessage("Password updated! Taking you to the login page…", "success");
    form.classList.add("hidden");
    await client.auth.signOut();
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1800);
  });
});