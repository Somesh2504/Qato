import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uexmarytjfalkrlwlgsz.supabase.co';
const supabaseKey = 'sb_publishable_10JKS8mjBE3L_B6ivUUxYg_RkiomFmL';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('menu_items').select('*').limit(1);
  console.log("Data:", data);
  if (error) console.error("Error:", error);
}

check();
