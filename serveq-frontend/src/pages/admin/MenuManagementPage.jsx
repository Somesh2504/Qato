import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, GripVertical, ImagePlus, MoreVertical, Plus, Save, Search, Trash2, X } from 'lucide-react';
import AdminSidebar from '../../components/layout/AdminSidebar';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { formatIndianPrice } from '../../utils/helpers';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  is_veg: true,
  category_id: '',
  photo_url: '',
  prep_time_minutes: '',
};

export default function MenuManagementPage() {
  const { restaurantId } = useAuth();
  const supabaseRef = useRef(null);
  const fileInputRef = useRef(null);
  const longPressRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragCategoryId, setDragCategoryId] = useState('');

  const loadData = async () => {
    if (!restaurantId || !supabaseRef.current) return;
    const [cat, menu] = await Promise.all([
      supabaseRef.current.from('menu_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true }),
      supabaseRef.current.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true }),
    ]);
    if (cat.error || menu.error) throw new Error('Failed to load menu');
    const nextCats = cat.data || [];
    setCategories(nextCats);
    setItems((menu.data || []).filter((x) => !x.is_deleted));
    if (!selectedCategoryId && nextCats.length) setSelectedCategoryId(nextCats[0].id);
  };

  useEffect(() => {
    try {
      supabaseRef.current = getSupabaseClient();
    } catch {
      setLoading(false);
      return;
    }
    loadData().catch(() => toast.error('Failed to load menu')).finally(() => setLoading(false));
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId || !supabaseRef.current) return;
    const catChannel = supabaseRef.current
      .channel(`menu-cat:${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories', filter: `restaurant_id=eq.${restaurantId}` }, () => loadData())
      .subscribe();
    const itemChannel = supabaseRef.current
      .channel(`menu-item:${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${restaurantId}` }, () => loadData())
      .subscribe();
    return () => {
      supabaseRef.current?.removeChannel(catChannel);
      supabaseRef.current?.removeChannel(itemChannel);
    };
  }, [restaurantId]);

  const counts = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => map.set(c.id, 0));
    items.forEach((i) => map.set(i.category_id, (map.get(i.category_id) || 0) + 1));
    return map;
  }, [categories, items]);

  const visibleItems = useMemo(() => {
    const source = items.filter((i) => i.category_id === selectedCategoryId);
    if (!search.trim()) return source;
    return source.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  }, [items, selectedCategoryId, search]);

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    const exists = categories.some((c) => c.name.toLowerCase() === newCategoryName.trim().toLowerCase());
    if (exists) {
      toast.error('A category with this name already exists');
      return;
    }
    const { count } = await supabaseRef.current.from('menu_categories').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId);
    const { data, error } = await supabaseRef.current
      .from('menu_categories')
      .insert({ restaurant_id: restaurantId, name: newCategoryName.trim(), sort_order: count || 0 })
      .select()
      .single();
    if (error) throw error;
    setSelectedCategoryId(data.id);
    setNewCategoryName('');
    setAddingCategory(false);
  };

  const openItemDrawer = (item = null) => {
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name || '',
        description: item.description || '',
        price: item.price?.toString() || '',
        is_veg: item.is_veg !== false,
        is_available: item.is_available !== false,
        category_id: item.category_id || selectedCategoryId,
        photo_url: item.photo_url || '',
        prep_time_minutes: item.prep_time_minutes?.toString() || '',
      });
    } else {
      setEditingItem(null);
      setForm({ ...EMPTY_FORM, category_id: selectedCategoryId || categories[0]?.id || '' });
    }
    setDrawerOpen(true);
  };

  const saveItem = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price || !form.category_id) return toast.error('Name, price and category are required');
    if (form.category_id === 'NEW' && !form.new_category_name?.trim()) return toast.error('New category name is required');
    
    const duplicate = items.find(
      (i) => i.category_id === (form.category_id === 'NEW' ? null : form.category_id) && 
             i.name.toLowerCase() === form.name.trim().toLowerCase() && 
             i.id !== editingItem?.id
    );
    if (duplicate) return toast.error('An item with this name already exists in this category');
    
    setSaving(true);
    let finalCategoryId = form.category_id;

    try {
      if (finalCategoryId === 'NEW') {
        const { count } = await supabaseRef.current.from('menu_categories').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId);
        const { data: newCat, error: catErr } = await supabaseRef.current
          .from('menu_categories')
          .insert({ restaurant_id: restaurantId, name: form.new_category_name.trim(), sort_order: count || 0 })
          .select()
          .single();
        if (catErr) throw catErr;
        finalCategoryId = newCat.id;
      }

      const payload = {
        restaurant_id: restaurantId,
        name: form.name.trim(),
        description: form.description || null,
        price: Number(form.price),
        is_veg: form.is_veg,
        is_available: form.is_available,
        category_id: finalCategoryId,
        photo_url: form.photo_url || null,
        prep_time_minutes: form.prep_time_minutes ? Number(form.prep_time_minutes) : null,
      };

      if (editingItem) {
        const { error } = await supabaseRef.current.from('menu_items').update(payload).eq('id', editingItem.id).eq('restaurant_id', restaurantId);
        if (error) throw error;
      } else {
        const { count } = await supabaseRef.current.from('menu_items').select('id', { count: 'exact', head: true }).eq('category_id', finalCategoryId).eq('restaurant_id', restaurantId);
        const { error } = await supabaseRef.current.from('menu_items').insert({ ...payload, sort_order: count || 0 });
        if (error) throw error;
      }
      setDrawerOpen(false);
      setEditingItem(null);
      setForm(EMPTY_FORM);
    } catch {
      toast.error('Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const softDeleteItem = async (item) => {
    const { error } = await supabaseRef.current
      .from('menu_items')
      .update({ is_available: false, is_deleted: true })
      .eq('id', item.id)
      .eq('restaurant_id', restaurantId);
    if (error) {
      const fallback = await supabaseRef.current.from('menu_items').update({ is_available: false }).eq('id', item.id).eq('restaurant_id', restaurantId);
      if (fallback.error) return toast.error('Failed to delete item');
    }
    toast.success('Item archived');
    setDrawerOpen(false);
  };

  const toggleAvailability = async (item) => {
    const { error } = await supabaseRef.current
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id)
      .eq('restaurant_id', restaurantId);
    if (error) toast.error('Failed to update availability');
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${restaurantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const upload = await supabaseRef.current.storage.from('menu-images').upload(path, file, { upsert: false });
      if (upload.error) throw upload.error;
      const pub = supabaseRef.current.storage.from('menu-images').getPublicUrl(path);
      setForm((prev) => ({ ...prev, photo_url: pub.data.publicUrl }));
    } catch {
      toast.error('Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

  const categoryActions = async (category) => {
    const name = prompt('New category name', category.name);
    if (!name?.trim()) return;
    const { error } = await supabaseRef.current.from('menu_categories').update({ name: name.trim() }).eq('id', category.id).eq('restaurant_id', restaurantId);
    if (error) toast.error('Failed to rename category');
  };

  const deleteCategory = async (category) => {
    if (!confirm('Delete this category? All items in it will also be deleted.')) return;
    try {
      const { error: itemsErr } = await supabaseRef.current.from('menu_items').delete().eq('category_id', category.id).eq('restaurant_id', restaurantId);
      if (itemsErr) throw itemsErr;
      const { error: catErr } = await supabaseRef.current.from('menu_categories').delete().eq('id', category.id).eq('restaurant_id', restaurantId);
      if (catErr) throw catErr;
      if (selectedCategoryId === category.id) setSelectedCategoryId('');
      toast.success('Category deleted');
    } catch {
      toast.error('Failed to delete category');
    }
  };

  const reorderCategories = async (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const list = [...categories];
    const from = list.findIndex((c) => c.id === sourceId);
    const to = list.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setCategories(list);
    await Promise.all(
      list.map((cat, idx) =>
        supabaseRef.current.from('menu_categories').update({ sort_order: idx }).eq('id', cat.id).eq('restaurant_id', restaurantId)
      )
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <AdminSidebar />
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col lg:grid lg:grid-cols-[30%_70%]">
          <section className="bg-white border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto max-h-[40vh] lg:max-h-full">
            <div className="sticky top-0 bg-white border-b border-gray-100 p-4">
              <h1 className="text-xl md:text-2xl font-bold text-[#1A1A2E]">Categories</h1>
            </div>
            <div className="p-3 space-y-2">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-xl p-3">
                      <div className="skeleton h-4 w-2/3 rounded" />
                      <div className="skeleton h-3 w-1/3 rounded mt-2" />
                    </div>
                  ))}
                </div>
              ) : categories.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => setDragCategoryId(c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorderCategories(dragCategoryId, c.id)}
                  onContextMenu={(e) => { e.preventDefault(); categoryActions(c); }}
                  onTouchStart={() => {
                    longPressRef.current = setTimeout(() => categoryActions(c), 700);
                  }}
                  onTouchEnd={() => {
                    if (longPressRef.current) clearTimeout(longPressRef.current);
                  }}
                  onClick={() => setSelectedCategoryId(c.id)}
                  className={`rounded-xl border p-3 cursor-pointer ${selectedCategoryId === c.id ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-200 bg-white'}`}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical size={16} className="text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1A1A2E] truncate">{c.name}</p>
                      <p className="text-xs text-gray-500">{counts.get(c.id) || 0} items</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); categoryActions(c); }} className="p-1 rounded-lg hover:bg-gray-100" title="Rename Category">
                        <MoreVertical size={14} className="text-gray-400" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteCategory(c); }} className="p-1 rounded-lg hover:bg-red-50 text-red-500" title="Delete Category">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-100 p-3">
              {!addingCategory ? (
                <Button variant="outline" fullWidth icon={<Plus size={14} />} onClick={() => setAddingCategory(true)}>Add Category</Button>
              ) : (
                <div className="space-y-2">
                  <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm" placeholder="Category name" />
                  <div className="flex gap-2">
                    <Button variant="outline" fullWidth onClick={() => { setAddingCategory(false); setNewCategoryName(''); }}>Cancel</Button>
                    <Button variant="primary" fullWidth onClick={() => addCategory().catch(() => toast.error('Failed to add category'))}>Save</Button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl md:text-2xl font-bold text-[#1A1A2E]">{categories.find((c) => c.id === selectedCategoryId)?.name || 'Items'}</h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 rounded-xl border border-gray-200 pl-8 pr-3 text-sm w-44 md:w-56" placeholder="Search item" />
                  </div>
                  <Button variant="primary" icon={<Plus size={14} />} onClick={() => openItemDrawer()}>Add Item</Button>
                </div>
              </div>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
                      <div className="skeleton w-full h-24 rounded-xl" />
                      <div className="skeleton h-4 w-4/5 rounded mt-3" />
                      <div className="skeleton h-4 w-1/2 rounded mt-2" />
                      <div className="skeleton h-3 w-2/3 rounded mt-2" />
                    </div>
                  ))}
                </div>
              ) : !selectedCategoryId ? (
                <EmptyState icon="👈" title="Select category" description="Pick a category to manage items." />
              ) : visibleItems.length === 0 ? (
                <EmptyState icon="🍽️" title="No items" description="Add your first item in this category." actionLabel="Add Item" onAction={() => openItemDrawer()} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleItems.map((item) => (
                    <div key={item.id} onClick={() => openItemDrawer(item)} role="button" tabIndex={0} className="text-left bg-white border border-gray-100 rounded-2xl p-3 shadow-sm hover:shadow-md cursor-pointer transition-shadow">
                      <div className="flex gap-3">
                        <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center">
                          {item.photo_url ? <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" /> : <span>{item.is_veg ? '🥗' : '🍗'}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-sm text-[#1A1A2E] line-clamp-2">{item.name}</p>
                            <span className={`w-3 h-3 rounded-full ${item.is_veg ? 'bg-green-500' : 'bg-red-500'}`} />
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm font-bold text-[#FF6B35]">{formatIndianPrice(item.price)}</p>
                            {item.prep_time_minutes && <p className="text-xs text-gray-500">~{item.prep_time_minutes} min</p>}
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className={`text-xs font-medium ${item.is_available ? 'text-green-600' : 'text-red-500'}`}>{item.is_available ? 'Available' : 'Sold out'}</span>
                            <button onClick={(e) => { e.stopPropagation(); toggleAvailability(item); }} className={`w-11 h-6 rounded-full relative ${item.is_available ? 'bg-[#FF6B35]' : 'bg-gray-300'}`}>
                              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white ${item.is_available ? 'left-5.5' : 'left-0.5'}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/35" onClick={() => setDrawerOpen(false)} />
          <div className="relative ml-auto w-full max-w-lg h-full bg-white overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between">
              <h3 className="font-bold text-lg text-[#1A1A2E]">{editingItem ? 'Edit Item' : 'Add Item'}</h3>
              <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-lg hover:bg-gray-100"><X size={17} /></button>
            </div>
            <form onSubmit={saveItem} className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center">
                  {form.photo_url ? <img src={form.photo_url} alt="Preview" className="w-full h-full object-cover" /> : <ImagePlus size={20} className="text-gray-400" />}
                </div>
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files?.[0])} />
                  <Button type="button" variant="outline" loading={uploading} onClick={() => fileInputRef.current?.click()}>Upload</Button>
                </div>
              </div>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm" placeholder="Item name" />
              <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm" placeholder="Price ₹" />
              <input type="number" min="1" value={form.prep_time_minutes} onChange={(e) => setForm((f) => ({ ...f, prep_time_minutes: e.target.value }))} className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm" placeholder="Estimated prep time (minutes)" />
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none" placeholder="Description" />
              <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))} className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm">
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="NEW">+ Add New Category</option>
              </select>
              {form.category_id === 'NEW' && (
                <input
                  type="text"
                  placeholder="Enter new category name..."
                  value={form.new_category_name || ''}
                  onChange={(e) => setForm((f) => ({ ...f, new_category_name: e.target.value }))}
                  className="w-full h-11 rounded-xl border border-[#FF6B35] px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF6B35]/20"
                  autoFocus
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setForm((f) => ({ ...f, is_veg: true }))} className={`p-3 rounded-xl border text-sm font-medium ${form.is_veg ? 'border-green-500 text-green-600' : 'border-gray-200 text-gray-500'}`}>Veg</button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, is_veg: false }))} className={`p-3 rounded-xl border text-sm font-medium ${!form.is_veg ? 'border-red-500 text-red-600' : 'border-gray-200 text-gray-500'}`}>Non-Veg</button>
              </div>
              <label className="p-3 rounded-xl border border-gray-200 flex items-center justify-between">
                <span className="text-sm">Available today</span>
                <button type="button" onClick={() => setForm((f) => ({ ...f, is_available: !f.is_available }))} className={`w-11 h-6 rounded-full relative ${form.is_available ? 'bg-[#FF6B35]' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full ${form.is_available ? 'left-5.5' : 'left-0.5'}`} />
                </button>
              </label>
              <div className="flex gap-3">
                {editingItem ? (
                  <Button type="button" variant="outline" className="border-red-300 text-red-600" onClick={() => softDeleteItem(editingItem)}>
                    <Trash2 size={14} />
                    Delete
                  </Button>
                ) : null}
                <Button type="button" variant="outline" fullWidth onClick={() => setDrawerOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary" fullWidth loading={saving}>
                  <Save size={14} />
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
