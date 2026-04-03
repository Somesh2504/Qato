import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://uexmarytjfalkrlwlgsz.supabase.co';
const supabaseKey = 'sb_publishable_10JKS8mjBE3L_B6ivUUxYg_RkiomFmL';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const payload = {
    restaurant_id: '4c481229-52c0-44a3-8df7-032e01baa5c3',
    name: "test item 2",
    description: null,
    price: 30,
    is_veg: true,
    is_available: true,
    photo_url: null,
    sort_order: 0
  };
  
  const { data: cat } = await supabase.from('menu_categories').select('id').limit(1);
  if (cat && cat[0]) payload.category_id = cat[0].id;
  
  const { data, error } = await supabase.from('menu_items').insert(payload);
  if (error) {
    fs.writeFileSync('error_log.json', JSON.stringify(error, null, 2));
  } else {
    fs.writeFileSync('error_log.json', JSON.stringify({success: true}, null, 2));
  }
}
check();
