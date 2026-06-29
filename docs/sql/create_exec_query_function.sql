-- ============================================================
-- Función RPC: exec_query
-- ============================================================
-- Esta función es OBLIGATORIA para que el backend Node.js
-- pueda ejecutarse contra este proyecto Supabase.
--
-- El backend (db.js) llama a:
--   supabase.rpc('exec_query', { query_text: '...' })
--
-- Formato de retorno (SIEMPRE):
--   - DDL (CREATE, ALTER, DROP, ...): {"rows": [], "rowCount": 0}
--   - DML/DQL con filas: {"rows": [{...}, {...}], "rowCount": N}
--   - Error: {"error": "msg", "detail": "...", "code": "42P01"}
--
-- INSTRUCCIONES:
--   1. Abre el SQL Editor de tu proyecto Supabase.
--   2. Pega todo el contenido de este archivo.
--   3. Ejecuta (Run / Ctrl+Enter).
--   4. Verifica que diga "Success. No rows returned".
-- ============================================================

DROP FUNCTION IF EXISTS public.exec_query(text);

CREATE OR REPLACE FUNCTION public.exec_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result json;
    cleaned text;
    first_token text;
    is_ddl boolean := false;
    error_msg text;
    error_detail text;
BEGIN
    -- Limpiar comentarios y whitespace inicial (espacios, tabs, CR, LF, etc).
    cleaned := regexp_replace(query_text, '--[^\n]*', '', 'g');
    cleaned := regexp_replace(cleaned, '/\*.*?\*/', '', 'g');
    cleaned := regexp_replace(cleaned, '^\s+', '', 'g');

    -- Detectar tipo de statement por la primera palabra.
    first_token := lower(split_part(cleaned, ' ', 1));

    -- DDL: ejecutar directo, no se puede envolver en subquery.
    IF first_token IN ('create', 'alter', 'drop', 'truncate', 'grant', 'revoke', 'comment') THEN
        EXECUTE cleaned;
        RETURN json_build_object('rows', '[]'::json, 'rowCount', 0);
    END IF;

    -- INSERT/UPDATE/DELETE con o sin RETURNING: ejecutar y, si tiene RETURNING,
    -- serializar el resultado; si no, devolver ok.
    IF first_token IN ('insert', 'update', 'delete') THEN
        -- Detectar si tiene RETURNING (case-insensitive).
        IF cleaned ~* '\mreturning\M' THEN
            -- Usar CTE porque Postgres no permite INSERT...RETURNING dentro de FROM.
            -- WRAP: WITH result AS (<sql>) SELECT row_to_json(result.*) AS json FROM result
            EXECUTE 'WITH result AS (' || cleaned || ') SELECT COALESCE(json_agg(row_to_json(result)), ''[]''::json) FROM result'
            INTO result;
            RETURN json_build_object('rows', result, 'rowCount', json_array_length(result));
        ELSE
            EXECUTE cleaned;
            RETURN json_build_object('rows', '[]'::json, 'rowCount', 0);
        END IF;
    END IF;

    -- DQL (SELECT, WITH, etc): envolver en subquery y serializar.
    EXECUTE 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (' || cleaned || ') t'
    INTO result;
    RETURN json_build_object('rows', result, 'rowCount', json_array_length(result));

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_msg = MESSAGE_TEXT,
                            error_detail = PG_EXCEPTION_DETAIL;
    RETURN json_build_object(
        'error', error_msg,
        'detail', error_detail,
        'code', SQLSTATE
    );
END;
$$;

-- Permisos: solo service_role puede invocarla.
REVOKE ALL ON FUNCTION public.exec_query(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_query(text) TO service_role;

-- ============================================================
-- Verificación rápida (descomentar para probar):
-- ============================================================
-- 1) DML: debe devolver {"rows":[{"id":1,"nombre":"hola"}],"rowCount":1}
-- SELECT public.exec_query('SELECT 1 AS id, ''hola''::text AS nombre');

-- 2) DDL: debe devolver {"rows":[],"rowCount":0}
-- SELECT public.exec_query('CREATE TABLE _test_ddl (id int)');
-- SELECT public.exec_query('DROP TABLE _test_ddl');

-- 3) Error: debe devolver JSON con "error"
-- SELECT public.exec_query('SELECT * FROM tabla_inexistente');
