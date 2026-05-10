const { Pool } = require('pg');
require('dotenv').config();

// Configuración de la conexión a Supabase
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { 
        rejectUnauthorized: false // Requerido para Supabase en la mayoría de los casos
    }
});

pool.on('connect', () => {
    console.log('Conexión establecida con la base de datos Supabase (PostgreSQL).');
});

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
});

/**
 * Helper para ejecutar consultas compatible con la interfaz anterior de SQLite.
 * Convierte parámetros de '?' a '$1, $2...' y maneja lastID/changes.
 */
const query = async (sql, params = []) => {
    // 1. Convertir '?' a '$1, $2...' para compatibilidad con pg
    let count = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++count}`);
    
    // 2. Si es un INSERT y no tiene RETURNING, lo agregamos para obtener el lastID
    let finalSql = pgSql;
    const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !pgSql.trim().toUpperCase().includes('RETURNING')) {
        // Solo agregamos RETURNING id si no es una tabla de unión o configuración conocida que no tiene 'id'
        const noIdTables = [
            'qa_user_permissions', 
            'qa_project_users', 
            'qa_use_case_users', 
            'qa_suite_users', 
            'qa_project_sequences', 
            'qa_tc_preconditions'
        ];
        const tableMatch = pgSql.match(/INTO\s+([a-zA-Z0-9_]+)/i);
        const tableName = tableMatch ? tableMatch[1].toLowerCase() : '';
        
        if (!noIdTables.includes(tableName)) {
            finalSql += ' RETURNING id';
        }
    }

    try {
        const result = await pool.query(finalSql, params);
        
        // Simular la respuesta de sqlite3
        return {
            rows: result.rows,
            lastID: (isInsert && result.rows.length > 0) ? result.rows[0].id : null,
            changes: result.rowCount
        };
    } catch (err) {
        console.error('Error en ejecución Postgres:', err.message);
        console.error('SQL Fallido:', finalSql);
        throw err;
    }
};

module.exports = {
    query,
    pool
};
