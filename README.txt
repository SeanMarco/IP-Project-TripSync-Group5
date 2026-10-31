TRIPSYNC DASHBOARD FILES

Files included:
- dashboard.html
- dashboard.css
- dashboard.js

SETUP
1. Copy all three files into the same TripSync folder as index.html and supabase-config.js.
2. Make sure dashboard.html loads scripts in this order:
   Supabase JS CDN, supabase-config.js, dashboard.js.
3. Keep your existing Supabase URL and publishable/anon key in supabase-config.js. Do not put a service_role or secret key in browser code.
4. In script.js, after a successful sign-in, redirect to dashboard.html. For example:
   const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
   if (error) throw error;
   window.location.href = 'dashboard.html';
5. The dashboard checks for an authenticated Supabase session and redirects to index.html if there is no session. To preview the visual design without signing in, open dashboard.html?preview=1.
6. The trip information and statistics are demo placeholders. Checklist interactions and logout work in the browser; trip planning, notifications, and itinerary editing are not connected to a database yet.

SIGNUP ERROR FIX
The message “Email signups are disabled” cannot be fixed in frontend JavaScript. In the correct Supabase project, enable the Email provider and allow new users to sign up. If you want instant practice accounts, turn Confirm email off as well. Ensure the project URL in supabase-config.js belongs to the project whose settings you changed.
