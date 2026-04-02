require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://uexmarytjfalkrlwlgsz.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_10JKS8mjBE3L_B6ivUUxYg_RkiomFmL';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // Check restaurants columns
  const { data: r1, error: e1 } = await supabase.from('restaurants').select('*').limit(1);
  console.log('=== RESTAURANTS COLUMNS ===');
  if (r1 && r1.length > 0) console.log(Object.keys(r1[0]).join(', '));
  else console.log('No rows or error:', JSON.stringify(e1));

  // Check orders columns
  const { data: r2, error: e2 } = await supabase.from('orders').select('*').limit(1);
  console.log('\n=== ORDERS COLUMNS ===');
  if (r2 && r2.length > 0) console.log(Object.keys(r2[0]).join(', '));
  else console.log('No rows or error:', JSON.stringify(e2));

  // Check order_items columns
  const { data: r3, error: e3 } = await supabase.from('order_items').select('*').limit(1);
  console.log('\n=== ORDER_ITEMS COLUMNS ===');
  if (r3 && r3.length > 0) console.log(Object.keys(r3[0]).join(', '));
  else console.log('No rows or error:', JSON.stringify(e3));

  // Check if transactions table exists
  const { data: r4, error: e4 } = await supabase.from('transactions').select('*').limit(1);
  console.log('\n=== TRANSACTIONS TABLE ===');
  console.log('Data:', JSON.stringify(r4), 'Error:', JSON.stringify(e4));
}

test();
