const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    'https://yucsroyorgebeuvcsmib.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1Y3Nyb3lvcmdlYmV1dmNzbWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwODIxOTUsImV4cCI6MjA3NzY1ODE5NX0.1K6GTmaRZj3xAehUap7dT-FQ5YEpBAbQUYoxNcTVyW0'
);

async function run() {
    console.log('Logging in...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'rpalexx14@gmail.com',
        password: '124522Alex'
    });

    if (authError) {
        console.error('Login error:', authError);
        return;
    }

    console.log('Fetching scripts...');
    const { data, error } = await supabase
        .from('scripts')
        .select('id, title, script_html')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching script:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log(`Script ID: ${data[0].id}`);
        console.log(`Title: ${data[0].title}`);
        console.log('--- HTML ---');
        console.log(data[0].script_html.substring(0, 500) + '...');
        fs.writeFileSync('last_script.html', data[0].script_html);
        console.log('Saved to last_script.html');
    } else {
        console.log('No scripts found.');
    }
}

run();
