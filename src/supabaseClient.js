import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xisvgpmrooebaznonfrw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpc3ZncG1yb29lYmF6bm9uZnJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3Njk5OTUsImV4cCI6MjA5ODM0NTk5NX0.6x-Nhy6yaUfuhyoAxEBmh2gZuhlJ2QoP8HsE_o_tZCU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
