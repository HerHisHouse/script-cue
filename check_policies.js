require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.rpc('get_policies_for_table', { target_table: 'objects' });
  if (error) {
    // Alternatively, just do a direct query if rpc doesn't exist
    const { data: d2, error: e2 } = await supabase.from('pg_policies').select('*').eq('tablename', 'objects');
    if (e2) {
      console.log("Could not query pg_policies via REST.", e2);
    } else {
      console.log(d2);
    }
  } else {
    console.log(data);
  }
}

main();
