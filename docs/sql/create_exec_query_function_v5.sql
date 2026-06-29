-- Deploy manual via SQL Editor: pega esto cuando estes listo.
DROP FUNCTION IF EXISTS public.exec_query(text);

CREATE OR REPLACE FUNCTION public.exec_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    result json;
    cleaned text;
    first_token text;
    error_msg text;
    error_detail text;
BEGIN
    cleaned := regexp_replace(query_text, '--[^\n]*', '', 'g');
    cleaned := regexp_replace(cleaned, '/\*.*?\*/', '', 'g');
    cleaned := regexp_replace(cleaned, '^\s+', '', 'g');

    first_token := lower(split_part(cleaned, ' ', 1));

    -- DDL
    IF first_token IN ('create', 'alter', 'drop', 'truncate', 'grant', 'revoke', 'comment') THEN
        EXECUTE cleaned;
        RETURN json_build_object('rows', '[]'::json, 'rowCount', 0);
    END IF;

    -- INSERT/UPDATE/DELETE
    IF first_token IN ('insert', 'update', 'delete') THEN
        IF cleaned ~* '\mreturning\M' THEN
            EXECUTE 'WITH result AS (' || cleaned || ') SELECT COALESCE(json_agg(row_to_json(result)), ''[]''::json) FROM result'
            INTO result;
            RETURN json_build_object('rows', result, 'rowCount', json_array_length(result));
        ELSE
            EXECUTE cleaned;
            RETURN json_build_object('rows', '[]'::json, 'rowCount', 0);
        END IF;
    END IF;

    -- DQL
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
$func$;

REVOKE ALL ON FUNCTION public.exec_query(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_query(text) TO service_role;
