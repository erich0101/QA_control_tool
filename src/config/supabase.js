'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('./env');

let _client = null;

function getSupabaseClient() {
    if (_client) return _client;
    _client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return _client;
}

function resetSupabaseClient() {
    _client = null;
}

module.exports = { getSupabaseClient, resetSupabaseClient };
