require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listAllFiles(bucket, path = '') {
  let allFiles = [];
  const { data, error } = await supabase.storage.from(bucket).list(path, {
    limit: 1000,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) {
    console.error(`Error listing ${path}:`, error.message);
    return [];
  }

  for (const item of data) {
    const fullPath = path ? `${path}/${item.name}` : item.name;
    // item is a folder if it has no metadata or metadata.mimetype is null and it's not a file
    if (!item.id) { // Folders usually don't have IDs in list output
      const subFiles = await listAllFiles(bucket, fullPath);
      allFiles = allFiles.concat(subFiles);
    } else {
      allFiles.push({
        name: item.name,
        path: fullPath,
        size: item.metadata?.size || 0,
        created_at: item.created_at
      });
    }
  }
  return allFiles;
}

async function main() {
  console.log("Checking storage bucket 'recordings'...");
  const files = await listAllFiles('recordings');
  
  console.log(`Found ${files.length} files in total.`);
  
  // Find top 20 largest files
  files.sort((a, b) => b.size - a.size);
  console.log("\nTop 20 largest files:");
  files.slice(0, 20).forEach(f => {
    console.log(`${(f.size / 1024 / 1024).toFixed(2)} MB - ${f.path}`);
  });
  
  // Aggregate by prefix (userId and segments folder)
  const prefixSizes = {};
  for (const f of files) {
    const prefix = f.path.includes('segments') ? f.path.split('/')[0] + '/segments' : f.path.split('/')[0];
    if (!prefixSizes[prefix]) prefixSizes[prefix] = { count: 0, size: 0 };
    prefixSizes[prefix].count += 1;
    prefixSizes[prefix].size += f.size;
  }
  
  const prefixes = Object.entries(prefixSizes).sort((a, b) => b[1].size - a[1].size);
  console.log("\nSizes by top-level folder / segments:");
  prefixes.forEach(([prefix, data]) => {
    console.log(`${(data.size / 1024 / 1024).toFixed(2)} MB (${data.count} files) - ${prefix}`);
  });
  
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  console.log(`\nTotal size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
}

main();
