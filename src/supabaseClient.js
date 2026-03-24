// =============================================
// SUPABASE CLIENT — Priya Industries
// =============================================
// This connects your app to the Supabase database

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://orzryzzaqiooizbulkyz.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_MpWc1WrkNqYQrAhDigiQGw_nS1KIibZ';

export const supabase = createClient(supabaseUrl, supabaseKey);

// ---- WORKER FUNCTIONS ----

export async function getWorkers() {
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('is_active', true)
    .order('id');
  if (error) throw error;
  return data;
}

export async function addWorker(id, name, pin) {
  const { data, error } = await supabase
    .from('workers')
    .insert({ id, name, pin })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeWorker(id) {
  const { error } = await supabase
    .from('workers')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function loginWorker(workerId, pin) {
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .ilike('id', workerId)
    .eq('pin', pin)
    .eq('is_active', true)
    .single();
  if (error) return null;
  return data;
}

// ---- ATTENDANCE FUNCTIONS ----

export async function markAttendance(workerId, session, lat, lng, markedBy = 'scan', reason = null) {
  const { data, error } = await supabase
    .from('attendance')
    .insert({
      worker_id: workerId,
      session,
      latitude: lat,
      longitude: lng,
      marked_by: markedBy,
      manual_reason: reason,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('ALREADY_SCANNED');
    }
    throw error;
  }
  return data;
}

export async function getTodayAttendance() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('date', today);
  if (error) throw error;
  return data;
}

export async function getWorkerAttendance(workerId, fromDate = null) {
  let query = supabase
    .from('attendance')
    .select('*')
    .eq('worker_id', workerId)
    .order('date', { ascending: false })
    .order('session');
  if (fromDate) {
    query = query.gte('date', fromDate);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getAllAttendance(fromDate, toDate) {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function hasScannedToday(workerId, session) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('attendance')
    .select('id')
    .eq('worker_id', workerId)
    .eq('date', today)
    .eq('session', session)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// ---- SETTINGS FUNCTIONS ----

export async function getSettings() {
  const { data, error } = await supabase
    .from('factory_settings')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateSettings(updates) {
  const { data, error } = await supabase
    .from('factory_settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- WEEKLY REPORT FUNCTIONS ----

export async function getWeeklyReport(weekStartDate, weekEndDate) {
  const { data: workers } = await supabase
    .from('workers')
    .select('*')
    .eq('is_active', true)
    .order('id');

  const { data: records } = await supabase
    .from('attendance')
    .select('*')
    .gte('date', weekStartDate)
    .lte('date', weekEndDate)
    .order('date');

  // Calculate per worker
  const report = workers.map(w => {
    const workerRecs = records.filter(r => r.worker_id === w.id);
    const byDate = {};
    workerRecs.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });

    let fullDays = 0;
    let halfDays = 0;
    Object.values(byDate).forEach(dayRecs => {
      const sessions = dayRecs.map(r => r.session);
      if (sessions.includes('morning') && sessions.includes('afternoon')) {
        fullDays++;
      } else {
        halfDays++;
      }
    });

    return {
      worker: w,
      fullDays,
      halfDays,
      totalEffective: fullDays + (halfDays * 0.5),
      records: workerRecs,
    };
  });

  return report;
}

// ---- HELPER: Get last Tuesday to this Monday range ----
export function getCurrentWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, 2=Tue...
  
  // Find last Tuesday (or today if Tuesday)
  const lastTuesday = new Date(today);
  const daysBack = dayOfWeek >= 2 ? dayOfWeek - 2 : dayOfWeek + 5;
  lastTuesday.setDate(today.getDate() - daysBack);
  
  // This Monday = last Tuesday + 6
  const thisMonday = new Date(lastTuesday);
  thisMonday.setDate(lastTuesday.getDate() + 6);

  return {
    start: lastTuesday.toISOString().split('T')[0],
    end: thisMonday.toISOString().split('T')[0],
  };
}
