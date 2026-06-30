import { supabase } from './supabaseClient.js'

/*
  Este módulo reemplaza window.storage (disponible solo dentro de Claude)
  con una implementación real usando una tabla de Supabase llamada "kv_store".

  Estructura de la tabla esperada (crear en Supabase SQL Editor):

  create table kv_store (
    key text primary key,
    value text not null,
    updated_at timestamp with time zone default now()
  );

  alter table kv_store enable row level security;

  create policy "Allow all access" on kv_store
    for all using (true) with check (true);
*/

async function get(key) {
  const { data, error } = await supabase
    .from('kv_store')
    .select('key, value')
    .eq('key', key)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return { key: data.key, value: data.value, shared: false }
}

async function set(key, value) {
  const { data, error } = await supabase
    .from('kv_store')
    .upsert({ key, value, updated_at: new Date().toISOString() })
    .select()
    .maybeSingle()

  if (error) throw error
  return { key, value, shared: false }
}

async function deleteKey(key) {
  const { error } = await supabase
    .from('kv_store')
    .delete()
    .eq('key', key)

  if (error) throw error
  return { key, deleted: true, shared: false }
}

async function list(prefix = '') {
  const { data, error } = await supabase
    .from('kv_store')
    .select('key')
    .like('key', `${prefix}%`)

  if (error) throw error
  return { keys: (data || []).map(d => d.key), prefix, shared: false }
}

// Exponemos el mismo shape que window.storage para no tener que reescribir
// el código del dashboard.
window.storage = {
  get,
  set,
  delete: deleteKey,
  list,
}
