-- ============================================================
-- Función RPC: exec_query
-- ============================================================
-- Esta función es OBLIGATORIA para que el backend Node.js
-- pueda ejecutarse contra este proyecto Supabase.
--
-- El backend (db.js) llama a:
--   supabase.rpc('exec_query', { query_text: '...' })
--
-- Por cada query. La función debe correr el SQL recibido y
-- devolver el resultado en formato JSON con la estructura
-- que el backend espera.
--
-- INSTRUCCIONES:
--   1. Abre el SQL Editor de tu proyecto Supabase.
--   2. Pega todo el contenido de este archivo.
--   3. Ejecuta (Run / Ctrl+Enter).
--   4. Verifica que diga "Success. No rows returned".
--
-- Este script es idempotente: puedes correrlo varias veces
-- sin romper nada (usa CREATE OR REPLACE).
-- ============================================================

-- Limpieza defensiva (por si la versión anterior existía)
DROP FUNCTION IF EXISTS public.exec_query(text);

CREATE OR REPLACE FUNCTION public.exec_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result json;
    error_msg text;
    error_detail text;
BEGIN
    BEGIN
        -- Intentar ejecutar y serializar resultado.
        -- COALESCE maneja el caso "0 rows" para que devuelva '[]' en vez de NULL.
        EXECUTE 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (' || query_text || ') t'
        INTO result;
        RETURN result;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT,
                                error_detail = PG_EXCEPTION_DETAIL;
        RETURN json_build_object(
            'error', error_msg,
            'detail', error_detail,
            'code', SQLSTATE
        );
    END;
END;
$$;

-- Permisos: solo service_role puede invocarla (es lo que usa el backend).
-- Si la anon key intentara llamarla, fallaría.
REVOKE ALL ON FUNCTION public.exec_query(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_query(text) TO service_role;

-- ============================================================
-- Verificación rápida (opcional, puedes comentar este bloque):
-- ============================================================
-- SELECT public.exec_query('SELECT 1 AS id, ''hola''::text AS nombre') AS test;
-- Debe devolver: [{"id":1,"nombre":"hola"}]
