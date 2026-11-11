
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // ==========================================
  // TRIPSYNC - SUPABASE AUTHENTICATION
  // ==========================================

  const $ = (id) => document.getElementById(id);

  const loginForm = $("login-form");
  const signupForm = $("signup-form");
  const loginTab = $("login-tab");
  const signupTab = $("signup-tab");
  const authSubtitle = $("auth-subtitle");
  const switchPrompt = $("switch-prompt");
  const formMessage = $("form-message");

  const loginEmail = $("login-email");
  const loginPassword = $("login-password");
  const rememberMe = $("remember-me");

  const firstNameInput = $("signup-firstname");
  const lastNameInput = $("signup-lastname");
  const signupEmail = $("signup-email");
  const signupPassword = $("signup-password");
  const confirmPassword = $("confirm-password");
  const acceptTerms = $("accept-terms");

  const strengthBar = $("strength-bar");
  const strengthText = $("strength-text");

  let isSubmitting = false;

  // ==========================================
  // MESSAGES
  // ==========================================

  function showMessage(message, type = "error") {
    if (!formMessage) return;

    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
    formMessage.style.display = "block";
  }

  function clearMessage() {
    if (!formMessage) return;

    formMessage.textContent = "";
    formMessage.className = "form-message";
    formMessage.style.display = "";
  }

  // ==========================================
  // AUTH TAB SWITCHING
  // ==========================================

  function setMode(mode) {
    const isLogin = mode === "login";

    loginForm.classList.toggle("hidden", !isLogin);
    signupForm.classList.toggle("hidden", isLogin);

    loginTab.classList.toggle("active", isLogin);
    signupTab.classList.toggle("active", !isLogin);

    if (authSubtitle) {
      authSubtitle.innerHTML = isLogin
        ? 'Log in to your account or create a new one<br class="desktop-break"> to start your next adventure.'
        : 'Create your account and get ready for<br class="desktop-break"> your next adventure.';
    }

    if (switchPrompt) {
      switchPrompt.replaceChildren();

      switchPrompt.append(
        document.createTextNode(
          isLogin
            ? "Don't have an account? "
            : "Already have an account? "
        )
      );

      const switchButton = document.createElement("button");
      switchButton.type = "button";
      switchButton.id = "switch-auth";
      switchButton.textContent = isLogin ? "Sign Up" : "Log In";

      switchButton.addEventListener("click", () => {
        setMode(isLogin ? "signup" : "login");
      });

      switchPrompt.appendChild(switchButton);
    }

    clearMessage();
  }

  loginTab.addEventListener("click", () => setMode("login"));
  signupTab.addEventListener("click", () => setMode("signup"));

  if ($("switch-auth")) {
    $("switch-auth").addEventListener("click", () => {
      setMode(loginForm.classList.contains("hidden") ? "login" : "signup");
    });
  }

  // ==========================================
  // PASSWORD VISIBILITY
  // ==========================================

  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", () => {
      const field = $(button.dataset.target);
      if (!field) return;

      const show = field.type === "password";
      field.type = show ? "text" : "password";

      button.innerHTML = show
        ? '<i class="fa-regular fa-eye-slash"></i>'
        : '<i class="fa-regular fa-eye"></i>';

      button.setAttribute(
        "aria-label",
        show ? "Hide password" : "Show password"
      );
    });
  });

  // ==========================================
  // VALIDATION
  // ==========================================

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function passwordStrength(password) {
    let score = 0;

    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    return score;
  }

  function setLoading(button, loading, loadingText, normalText) {
    if (!button) return;

    button.disabled = loading;
    button.setAttribute("aria-busy", String(loading));

    const span = button.querySelector("span");
    if (span) {
      span.textContent = loading ? loadingText : normalText;
    }
  }

  function getSupabaseClient() {
    if (
      typeof supabaseClient === "undefined" ||
      !supabaseClient?.auth
    ) {
      throw new Error(
        "Supabase is not configured. Check supabase-config.js and the script order in index.html."
      );
    }

    return supabaseClient;
  }

  // ==========================================
  // PASSWORD STRENGTH
  // ==========================================

  if (signupPassword) {
    signupPassword.addEventListener("input", () => {
      const password = signupPassword.value;
      const score = passwordStrength(password);

      const labels = [
        "Use at least 8 characters",
        "Weak password",
        "Fair password",
        "Good password",
        "Strong password"
      ];

      const colors = [
        "",
        "#E53E3E",
        "#F6A623",
        "#39BAF3",
        "#0EA974"
      ];

      if (strengthBar) {
        strengthBar.style.width =
          password.length === 0 ? "0%" : `${score * 25}%`;
        strengthBar.style.backgroundColor = colors[score];
      }

      if (strengthText) {
        strengthText.textContent =
          labels[password.length === 0 ? 0 : score];
      }
    });
  }

  // ==========================================
  // SIGN UP
  // ==========================================

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    clearMessage();

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const email = signupEmail.value.trim();
    const password = signupPassword.value;
    const confirmation = confirmPassword.value;

    if (!firstName || !lastName || !email || !password || !confirmation) {
      showMessage("Please fill in all required fields.");
      return;
    }

    if (!validEmail(email)) {
      showMessage("Please enter a valid email address.");
      signupEmail.focus();
      return;
    }

    if (password.length < 8) {
      showMessage("Your password must contain at least 8 characters.");
      signupPassword.focus();
      return;
    }

    if (passwordStrength(password) < 3) {
      showMessage(
        "Please choose a stronger password using uppercase and lowercase letters, numbers, or symbols."
      );
      signupPassword.focus();
      return;
    }

    if (password !== confirmation) {
      showMessage("Your passwords do not match.");
      confirmPassword.focus();
      return;
    }

    if (!acceptTerms.checked) {
      showMessage("Please accept the Terms of Service and Privacy Policy.");
      return;
    }

    const button = signupForm.querySelector('button[type="submit"]');

    isSubmitting = true;
    setLoading(button, true, "Creating account...", "Create Account");

    try {
      const client = getSupabaseClient();

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName
          }
        }
      });

      if (error) {
        console.error("Signup error:", error.message, error.status);
        throw error;
      }

      if (!data.user) {
        throw new Error("The account could not be created. Please try again.");
      }

      // Email confirmation must be OFF in Supabase
      // for a new signup to return a session immediately.
      if (!data.session) {
        showMessage(
          "Supabase created no active session. Check that Confirm email is OFF in your Supabase Email provider settings."
        );
        return;
      }

      // Save the email before clearing the signup form.
      const registeredEmail = email;

      // End the signup session so the user can log in manually.
      const { error: logoutError } = await client.auth.signOut();

      if (logoutError) {
        console.warn("Could not clear signup session:", logoutError.message);
      }

      signupForm.reset();

      if (strengthBar) strengthBar.style.width = "0%";
      if (strengthText) {
        strengthText.textContent = "Use at least 8 characters";
      }

      setMode("login");

      loginEmail.value = registeredEmail;
      loginPassword.value = "";

      showMessage(
        "Account created successfully! You can now log in.",
        "success"
      );
    } catch (error) {
      console.error("Signup failed:", error);

      const message = error.message || "Unable to create your account.";

      if (message.toLowerCase().includes("email signups are disabled")) {
        showMessage(
          "Email signups are disabled in Supabase. Enable the Email provider and allow new users to sign up in your project settings."
        );
      } else if (
        message.toLowerCase().includes("database error saving new user")
      ) {
        showMessage(
          "Supabase could not save the new user. Check your Auth and database logs for a trigger or database error."
        );
      } else {
        showMessage(message);
      }
    } finally {
      isSubmitting = false;
      setLoading(button, false, "Creating account...", "Create Account");
    }
  });

  // ==========================================
  // LOGIN
  // ==========================================

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    clearMessage();

    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
      showMessage("Please enter your email and password.");
      return;
    }

    if (!validEmail(email)) {
      showMessage("Please enter a valid email address.");
      loginEmail.focus();
      return;
    }

    const button = loginForm.querySelector('button[type="submit"]');

    isSubmitting = true;
    setLoading(button, true, "Logging in...", "Log In");

    try {
      const client = getSupabaseClient();

      const { data, error } = await client.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (!data.user) {
        throw new Error("Login failed. Please try again.");
      }

      
showMessage("Login successful! Welcome back.", "success");

console.log("Login successful:", data.user.id);

// Redirect to the dashboard after a short delay.
setTimeout(() => {
  window.location.href = "../dashboard/dashboard.html";
}, 500);

    } catch (error) {
      console.error("Login failed:", error);

      if (
        error.message?.toLowerCase().includes("email not confirmed")
      ) {
        showMessage(
          "This account requires email confirmation. Turn off Confirm email in Supabase, or confirm this account before logging in."
        );
      } else {
        showMessage(error.message || "Unable to log in. Please try again.");
      }
    } finally {
      isSubmitting = false;
      setLoading(button, false, "Logging in...", "Log In");
    }
  });

  // ==========================================
  // FORGOT PASSWORD
  // ==========================================

  const forgotPassword = $("forgot-password");

  if (forgotPassword) {
    forgotPassword.addEventListener("click", async (event) => {
      event.preventDefault();
      clearMessage();

      const email = loginEmail.value.trim();

      if (!email || !validEmail(email)) {
        showMessage("Enter a valid email address in the Login form first.");
        loginEmail.focus();
        return;
      }

      try {
        const client = getSupabaseClient();

        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password.html`
        });

        if (error) throw error;

        showMessage(
          "If an account exists for that email, a password reset link will be sent.",
          "success"
        );
      } catch (error) {
        console.error("Password reset error:", error);
        showMessage(error.message || "Unable to request a password reset.");
      }
    });
  }

  // ==========================================
  // SOCIAL LOGIN
  // ==========================================

  document.querySelectorAll(".social-button").forEach((button) => {
    button.addEventListener("click", async () => {
      clearMessage();

      const providerName = button.dataset.provider;

      if (providerName === "Apple") {
        showMessage(
          "Apple sign-in is not configured yet. Please use email and password."
        );
        return;
      }

      const providers = {
        Google: "google",
        Facebook: "facebook"
      };

      const provider = providers[providerName];

      if (!provider) {
        showMessage("This sign-in provider is not supported.");
        return;
      }

      try {
        const client = getSupabaseClient();

        const { error } = await client.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${window.location.origin}/index/index.html`
          }
        });

        if (error) throw error;
      } catch (error) {
        console.error(`${providerName} sign-in error:`, error);

        showMessage(
          error.message ||
            `${providerName} sign-in failed. Check your Supabase provider settings.`
        );
      }
    });
  });

  // ==========================================
  // TERMS AND PRIVACY PLACEHOLDERS
  // ==========================================

  const termsLink = $("terms-link");
  const privacyLink = $("privacy-link");

  if (termsLink) {
    termsLink.addEventListener("click", (event) => {
      event.preventDefault();
      showMessage("The Terms of Service page has not been added yet.", "error");
    });
  }

  if (privacyLink) {
    privacyLink.addEventListener("click", (event) => {
      event.preventDefault();
      showMessage("The Privacy Policy page has not been added yet.", "error");
    });
  }

  // ==========================================
  // SESSION CHECK
  // ==========================================

  async function checkSession() {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getSession();

      if (error) throw error;

      if (data.session) {
        console.log("An active Supabase session exists.");

        // Enable if you want automatic dashboard redirection:
        window.location.href = "../dashboard/dashboard.html";
      }
    } catch (error) {
      console.error("Session check error:", error.message);
    }
  }

  // Initial state
  setMode("login");
  checkSession();
});
