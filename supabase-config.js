
const SUPABASE_URL = "https://pseewchrytzzlvawwqzw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__cHbj5sVoIqS4IyejzKEiw_z9mvK1Qp";

const { createClient } = supabase;

const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("Supabase client:", supabaseClient);
console.log("Supabase URL:", SUPABASE_URL);

console.log(
  "Expected signup endpoint:",
  `${SUPABASE_URL}/auth/v1/signup`
);