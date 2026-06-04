const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan variables de entorno EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
  const sql = fs.readFileSync(path.join(__dirname, 'supabase/migrations/20260523115233_add_total_scripts_imported.sql'), 'utf8');
  console.log("Running SQL...");
  
  // Since we might not have a direct run_sql RPC, let's try the common rpc 'exec_sql' if it exists
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error("Error executing via rpc (this is expected if rpc doesn't exist):", error.message);
    console.log("We'll use a direct fetch to the postgres connection string if available, or just output the SQL for manual execution.");
  } else {
    console.log("Success:", data);
  }
}

runSQL();
