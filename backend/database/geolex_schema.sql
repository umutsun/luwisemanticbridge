--
-- PostgreSQL database dump
--

\restrict yGaPKedrFHb0Yw9jh6iJh6IytJXG8t5g6waZzL1la295SGYKt7hV3M8tx8EUHo7

-- Dumped from database version 15.14
-- Dumped by pg_dump version 15.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ai; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ai;


--
-- Name: lightrag; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA lightrag;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: btree_gin; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA public;


--
-- Name: EXTENSION btree_gin; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gin IS 'support for indexing common datatypes in GIN';


--
-- Name: dblink; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA public;


--
-- Name: EXTENSION dblink; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION dblink IS 'connect to other PostgreSQL databases from within a database';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: vectorscale; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vectorscale WITH SCHEMA public;


--
-- Name: EXTENSION vectorscale; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vectorscale IS 'diskann access method for vector search';


--
-- Name: _evaluate_destination(jsonb, name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._evaluate_destination(destination jsonb, source_schema name, source_table name) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    target_schema pg_catalog.name;
    target_table pg_catalog.name;
    view_schema pg_catalog.name;
    view_name pg_catalog.name;
begin
    if destination operator(pg_catalog.->>) 'implementation' = 'table' then
        target_schema = coalesce(destination operator(pg_catalog.->>) 'target_schema', source_schema);
        target_table = case
            when destination operator(pg_catalog.->>) 'target_table' is not null then destination operator(pg_catalog.->>) 'target_table'
            when destination operator(pg_catalog.->>) 'destination' is not null then pg_catalog.concat(destination operator(pg_catalog.->>) 'destination', '_store')
            else pg_catalog.concat(source_table, '_embedding_store')
        end;
        view_schema = coalesce(view_schema, source_schema);
        view_name = case
            when destination operator(pg_catalog.->>) 'view_name' is not null then destination operator(pg_catalog.->>) 'view_name'
            when destination operator(pg_catalog.->>) 'destination' is not null then destination operator(pg_catalog.->>) 'destination'
            else pg_catalog.concat(source_table, '_embedding')
        end;
        return json_build_object
        ( 'implementation', 'table'
        , 'config_type', 'destination'
        , 'target_schema', target_schema
        , 'target_table', target_table
        , 'view_schema', view_schema
        , 'view_name', view_name
        );
    elseif destination operator(pg_catalog.->>) 'implementation' = 'column' then
        return json_build_object
        ( 'implementation', 'column'
        , 'config_type', 'destination'
        , 'embedding_column', destination operator(pg_catalog.->>) 'embedding_column'
        );
    else
        raise exception 'invalid implementation for destination config';
    end if;
end
$$;


--
-- Name: _resolve_indexing_default(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._resolve_indexing_default() RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _setting pg_catalog.text;
begin
    select pg_catalog.current_setting('ai.indexing_default', true) into _setting;
    case _setting
        when 'indexing_diskann' then
            return ai.indexing_diskann();
        when 'indexing_hnsw' then
            return ai.indexing_hnsw();
        else
            return ai.indexing_none();
    end case;
end;
$$;


--
-- Name: _resolve_scheduling_default(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._resolve_scheduling_default() RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _setting pg_catalog.text;
begin
    select pg_catalog.current_setting('ai.scheduling_default', true) into _setting;
    case _setting
        when 'scheduling_timescaledb' then
            return ai.scheduling_timescaledb();
        else
            return ai.scheduling_none();
    end case;
end;
$$;


--
-- Name: _sc_obj(integer); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._sc_obj(catalog_id integer) RETURNS TABLE(id bigint, classid oid, objid oid, objsubid integer, objtype text, objnames text[], objargs text[], description text)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _sql text;
begin
    _sql = format
    ( $sql$
        select
          id
        , classid
        , objid
        , objsubid
        , objtype
        , objnames
        , objargs
        , description
        from ai.semantic_catalog_obj_%s
      $sql$
    , catalog_id
    );
    return query execute _sql;
end
$_$;


--
-- Name: _semantic_catalog_make_triggers(integer); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._semantic_catalog_make_triggers(semantic_catalog_id integer) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
/*
this function dynamically creates triggers on the obj, sql, and fact tables associated with a
semantic catalog. if any non-vector columns are updated, the vector columns are nulled out by
these triggers. this serves as the signal that the row should be reembedded
*/
declare
    _tbl text;
    _sql text;
    _vec_type oid;
    _vec_nulls text;
    _col_diffs text;
begin
    -- find the oid of the vector data type
    select y.oid into strict _vec_type
    from pg_type y
    inner join pg_depend d on (y.oid = d.objid)
    inner join pg_extension x on (x.oid = d.refobjid)
    where d.classid = 'pg_catalog.pg_type'::regclass::oid
    and d.refclassid = 'pg_catalog.pg_extension'::regclass::oid
    and d.deptype = 'e'
    and x.extname = 'vector'
    and y.typname = 'vector'
    ;

    foreach _tbl in array array['obj', 'sql', 'fact']
    loop
        select string_agg
        (
          format
          ( $sql$new.%s = null;$sql$
          , a.attname
          )
        , E'\n        '
        order by a.attnum
        ) filter (where a.atttypid = _vec_type)
        , string_agg
        (
          format
          ( $sql$(old.%s != new.%s)$sql$
          , a.attname
          , a.attname
          )
        , E'\n    or '
        order by a.attnum
        ) filter (where a.atttypid != _vec_type)
        into strict 
          _vec_nulls
        , _col_diffs
        from pg_class k
        inner join pg_namespace n on (k.relnamespace = n.oid)
        inner join pg_attribute a on (k.oid = a.attrelid)
        where n.nspname = 'ai'
        and k.relname = format('semantic_catalog_%s_%s', _tbl, semantic_catalog_id)
        and a.attnum > 0
        and not a.attisdropped
        ;
        
        _sql = format(regexp_replace(
        $sql$
        create or replace function ai.semantic_catalog_%s_%s_trig() returns trigger
        as $trigger$
        declare
        begin
            if tg_op = 'UPDATE' and
            (  %s
            )
            then
                %s
            end if;
            return new;
        end
        $trigger$ language plpgsql volatile security invoker
        set search_path to pg_catalog, pg_temp
        $sql$, '^ {8}', '', 'gm') -- dedent 8 spaces
        , _tbl
        , semantic_catalog_id
        , _col_diffs
        , _vec_nulls
        );
        raise debug '%', _sql;
        execute _sql;
        
        perform
        from pg_class k
        inner join pg_namespace n on (k.relnamespace = n.oid)
        inner join pg_trigger g on (g.tgrelid = k.oid)
        where n.nspname = 'ai'
        and k.relname = format('semantic_catalog_%s_%s', _tbl, semantic_catalog_id)
        and g.tgname = format('semantic_catalog_%s_%s_trig', _tbl, semantic_catalog_id)
        ;
        if not found then
            _sql = format(regexp_replace(
            $sql$
            create trigger semantic_catalog_%s_%s_trig 
            before update on ai.semantic_catalog_%s_%s
            for each row
            execute function ai.semantic_catalog_%s_%s_trig()
            $sql$, '^ {12}', '', 'gm') -- dedent 12 spaces
            , _tbl
            , semantic_catalog_id
            , _tbl
            , semantic_catalog_id
            , _tbl
            , semantic_catalog_id
            );
            raise debug '%', _sql;
            execute _sql;
        end if;
    end loop;
end
$_$;


--
-- Name: _validate_chunking(jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_chunking(config jsonb) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _config_type pg_catalog.text;
    _implementation pg_catalog.text;
begin
    if pg_catalog.jsonb_typeof(config) operator(pg_catalog.!=) 'object' then
        raise exception 'chunking config is not a jsonb object';
    end if;

    _config_type = config operator(pg_catalog.->>) 'config_type';
    if _config_type is null or _config_type operator(pg_catalog.!=) 'chunking' then
        raise exception 'invalid config_type for chunking config';
    end if;

    _implementation = config operator(pg_catalog.->>) 'implementation';
    if _implementation is null or _implementation not in ('character_text_splitter', 'recursive_character_text_splitter', 'none') then
        raise exception 'invalid chunking config implementation';
    end if;
end
$$;


--
-- Name: _validate_destination(jsonb, jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_destination(destination jsonb, chunking jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _config_type pg_catalog.text;
begin
    if pg_catalog.jsonb_typeof(destination) operator(pg_catalog.!=) 'object' then
        raise exception 'destination config is not a jsonb object';
    end if;

    _config_type = destination operator(pg_catalog.->>) 'config_type';
    if _config_type is null or _config_type operator(pg_catalog.!=) 'destination' then
        raise exception 'invalid config_type for destination config';
    end if;

    if destination->>'implementation' = 'column' then
        if chunking->>'implementation' != 'none' then
            raise exception 'chunking must be none for column destination';
        end if;
    end if;
end
$$;


--
-- Name: _validate_destination_can_create_objects(jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_destination_can_create_objects(destination jsonb) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _config_type pg_catalog.text;
begin
    if destination operator(pg_catalog.->>) 'implementation' = 'table' then
         -- make sure view name is available
        if pg_catalog.to_regclass(pg_catalog.format('%I.%I', destination operator(pg_catalog.->>) 'view_schema', destination operator(pg_catalog.->>) 'view_name')) is not null then
            raise exception 'an object named %.% already exists. specify an alternate destination or view_name explicitly', destination operator(pg_catalog.->>) 'view_schema', destination operator(pg_catalog.->>) 'view_name'
            using errcode = 'duplicate_object';
        end if;
    
        -- make sure target table name is available
        if pg_catalog.to_regclass(pg_catalog.format('%I.%I', destination operator(pg_catalog.->>) 'target_schema', destination operator(pg_catalog.->>) 'target_table')) is not null then
            raise exception 'an object named %.% already exists. specify an alternate destination or target_table explicitly', destination operator(pg_catalog.->>) 'target_schema', destination operator(pg_catalog.->>) 'target_table'
            using errcode = 'duplicate_object';
        end if;
    end if;
end
$$;


--
-- Name: _validate_embedding(jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_embedding(config jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _config_type pg_catalog.text;
    _implementation pg_catalog.text;
begin
    if pg_catalog.jsonb_typeof(config) operator(pg_catalog.!=) 'object' then
        raise exception 'embedding config is not a jsonb object';
    end if;

    _config_type = config operator(pg_catalog.->>) 'config_type';
    if _config_type is null or _config_type operator(pg_catalog.!=) 'embedding' then
        raise exception 'invalid config_type for embedding config';
    end if;
    _implementation = config operator(pg_catalog.->>) 'implementation';
    case _implementation
        when 'openai' then
            -- ok
        when 'ollama' then
            -- ok
        when 'voyageai' then
            -- ok
        when 'litellm' then
            -- ok
        else
            if _implementation is null then
                raise exception 'embedding implementation not specified';
            else
                raise exception 'invalid embedding implementation: "%"', _implementation;
            end if;
    end case;
end
$$;


--
-- Name: _validate_formatting(jsonb, name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_formatting(config jsonb, source_schema name, source_table name) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _config_type pg_catalog.text;
begin
    if pg_catalog.jsonb_typeof(config) != 'object' then
        raise exception 'formatting config is not a jsonb object';
    end if;

    _config_type = config operator ( pg_catalog.->> ) 'config_type';
    if _config_type is null or _config_type operator(pg_catalog.!=) 'formatting' then
        raise exception 'invalid config_type for formatting config';
    end if;
    case config operator(pg_catalog.->>) 'implementation'
        when 'python_template' then
            perform ai._validate_formatting_python_template
            ( config
            , source_schema
            , source_table
            );
        else
            raise exception 'unrecognized formatting implementation';
    end case;
end
$$;


--
-- Name: _validate_formatting_python_template(jsonb, name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_formatting_python_template(config jsonb, source_schema name, source_table name) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _template pg_catalog.text;
    _found pg_catalog.bool;
begin
    select config operator(pg_catalog.->>) 'template'
    into strict _template
    ;
    if not pg_catalog.like(_template, '%$chunk%') then
        raise exception 'template must contain $chunk placeholder';
    end if;

    -- check that no columns on the source table are named "chunk"
    select count(*) operator(pg_catalog.>) 0 into strict _found
    from pg_catalog.pg_class k
    inner join pg_catalog.pg_namespace n on (k.relnamespace = n.oid)
    inner join pg_catalog.pg_attribute a on (k.oid = a.attrelid)
    where n.nspname operator(pg_catalog.=) source_schema
    and k.relname operator(pg_catalog.=) source_table
    and a.attnum operator(pg_catalog.>) 0
    and a.attname operator(pg_catalog.=) 'chunk'
    ;
    if _found then
        raise exception 'formatting_python_template may not be used when source table has a column named "chunk"';
    end if;
end
$_$;


--
-- Name: _validate_indexing(jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_indexing(config jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _config_type pg_catalog.text;
    _implementation pg_catalog.text;
begin
    if pg_catalog.jsonb_typeof(config) operator(pg_catalog.!=) 'object' then
        raise exception 'indexing config is not a jsonb object';
    end if;

    _config_type = config operator(pg_catalog.->>) 'config_type';
    if _config_type is null or _config_type operator(pg_catalog.!=) 'indexing' then
        raise exception 'invalid config_type for indexing config';
    end if;
    _implementation = config operator(pg_catalog.->>) 'implementation';
    case _implementation
        when 'none' then
            -- ok
        when 'diskann' then
            perform ai._validate_indexing_diskann(config);
        when 'hnsw' then
            perform ai._validate_indexing_hnsw(config);
        else
            if _implementation is null then
                raise exception 'indexing implementation not specified';
            else
                raise exception 'invalid indexing implementation: "%"', _implementation;
            end if;
    end case;
end
$$;


--
-- Name: _validate_indexing_diskann(jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_indexing_diskann(config jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _storage_layout pg_catalog.text;
begin
    _storage_layout = config operator(pg_catalog.->>) 'storage_layout';
    if _storage_layout is not null and not (_storage_layout operator(pg_catalog.=) any(array['memory_optimized', 'plain'])) then
        raise exception 'invalid storage_layout';
    end if;
end
$$;


--
-- Name: _validate_indexing_hnsw(jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_indexing_hnsw(config jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _opclass pg_catalog.text;
begin
    _opclass = config operator(pg_catalog.->>) 'opclass';
    if _opclass is not null
    and not (_opclass operator(pg_catalog.=) any(array['vector_ip_ops', 'vector_cosine_ops', 'vector_l1_ops'])) then
        raise exception 'invalid opclass';
    end if;
end
$$;


--
-- Name: _validate_loading(jsonb, name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_loading(config jsonb, source_schema name, source_table name) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _config_type pg_catalog.text;
    _implementation pg_catalog.text;
    _column_name pg_catalog.name;
    _found pg_catalog.bool;
    _column_type pg_catalog.text;
begin
    if pg_catalog.jsonb_typeof(config) operator(pg_catalog.!=) 'object' then
        raise exception 'loading config is not a jsonb object';
end if;

    _config_type = config operator(pg_catalog.->>) 'config_type';
    if _config_type is null or _config_type operator(pg_catalog.!=) 'loading' then
        raise exception 'invalid config_type for loading config';
end if;

    _implementation = config operator(pg_catalog.->>) 'implementation';
    if _implementation is null or _implementation not in ('column', 'uri') then
        raise exception 'invalid loading config implementation';
end if;

    _column_name = config operator(pg_catalog.->>) 'column_name';
     if _column_name is null then
        raise exception 'invalid loading config, missing column_name';
end if;

    if (config operator(pg_catalog.->>) 'retries') is null or (config operator(pg_catalog.->>) 'retries')::int < 0 then
        raise exception 'invalid loading config, retries must be a non-negative integer';
end if;
    if (config operator(pg_catalog.->>) 'aws_role_arn') is not null and (config operator(pg_catalog.->>) 'aws_role_arn') not like 'arn:aws:iam::%:role/%' then
        raise exception 'invalid loading config, aws_role_arn must match arn:aws:iam::*:role/*';
end if;

    select y.typname into _column_type
    from pg_catalog.pg_class k
        inner join pg_catalog.pg_namespace n on (k.relnamespace operator(pg_catalog.=) n.oid)
        inner join pg_catalog.pg_attribute a on (k.oid operator(pg_catalog.=) a.attrelid)
        inner join pg_catalog.pg_type y on (a.atttypid operator(pg_catalog.=) y.oid)
    where n.nspname operator(pg_catalog.=) source_schema
        and k.relname operator(pg_catalog.=) source_table
        and a.attnum operator(pg_catalog.>) 0
        and a.attname operator(pg_catalog.=) _column_name
        and not a.attisdropped;

    if _column_type is null then
            raise exception 'column_name in config does not exist in the table: %', _column_name;
    end if;

    if _column_type not in ('text', 'varchar', 'char', 'bpchar', 'bytea') then
            raise exception 'column_name % in config is of invalid type %. Supported types are: text, varchar, char, bpchar, bytea', _column_name, _column_type;
    end if;

    if _implementation = 'uri' and _column_type not in ('text', 'varchar', 'char', 'bpchar') then
        raise exception 'the type of the column `%` in config is not compatible with `uri` loading '
       'implementation (type should be either text, varchar, char, bpchar, or bytea)', _column_name;
    end if;
end
$$;


--
-- Name: _validate_parsing(jsonb, jsonb, name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_parsing(parsing jsonb, loading jsonb, source_schema name, source_table name) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _column_type pg_catalog.name;
    _config_type pg_catalog.text;
    _loading_implementation pg_catalog.text;
    _parsing_implementation pg_catalog.text;
begin
    -- Basic structure validation
    if pg_catalog.jsonb_typeof(parsing) operator(pg_catalog.!=) 'object' then
        raise exception 'parsing config is not a jsonb object';
    end if;

    -- Validate config_type
    _config_type = parsing operator(pg_catalog.->>) 'config_type';
    if _config_type is null or _config_type operator(pg_catalog.!=) 'parsing' then
        raise exception 'invalid config_type for parsing config';
    end if;

    -- Get implementations
    _loading_implementation = loading operator(pg_catalog.->>) 'implementation';
    -- Skip validation of loading implementation since it's done in _validate_loading

    _parsing_implementation = parsing operator(pg_catalog.->>) 'implementation';
    if _parsing_implementation not in ('auto', 'none', 'pymupdf', 'docling') then
        raise exception 'invalid parsing config implementation';
    end if;

    -- Get the column type once
    select y.typname 
    into _column_type
    from pg_catalog.pg_class k
        inner join pg_catalog.pg_namespace n on (k.relnamespace operator(pg_catalog.=) n.oid)
        inner join pg_catalog.pg_attribute a on (k.oid operator(pg_catalog.=) a.attrelid)
        inner join pg_catalog.pg_type y on (a.atttypid operator(pg_catalog.=) y.oid)
    where n.nspname operator(pg_catalog.=) source_schema
    and k.relname operator(pg_catalog.=) source_table
    and a.attnum operator(pg_catalog.>) 0
    and a.attname operator(pg_catalog.=) (loading operator(pg_catalog.->>) 'column_name');

    -- Validate all combinations
    if _parsing_implementation = 'none' and _column_type = 'bytea' then
        raise exception 'cannot use parsing_none with bytea columns';
    end if;

    if _loading_implementation = 'column' and _parsing_implementation in ('pymupdf', 'docling')
       and _column_type != 'bytea' then
        raise exception 'parsing_% must be used with a bytea column', _parsing_implementation;
    end if;

end
$$;


--
-- Name: _validate_processing(jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_processing(config jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _config_type pg_catalog.text;
    _implementation pg_catalog.text;
    _val pg_catalog.jsonb;
begin
    if pg_catalog.jsonb_typeof(config) operator(pg_catalog.!=) 'object' then
        raise exception 'processing config is not a jsonb object';
    end if;

    _config_type = config operator(pg_catalog.->>) 'config_type';
    if _config_type is null or _config_type operator(pg_catalog.!=) 'processing' then
        raise exception 'invalid config_type for processing config';
    end if;
    _implementation = config operator(pg_catalog.->>) 'implementation';
    case _implementation
        when 'default' then
            _val = pg_catalog.jsonb_extract_path(config, 'batch_size');
            if _val is not null then
                if pg_catalog.jsonb_typeof(_val) operator(pg_catalog.!=) 'number' then
                    raise exception 'batch_size must be a number';
                end if;
                if cast(_val as pg_catalog.int4) operator(pg_catalog.>) 2048 then
                    raise exception 'batch_size must be less than or equal to 2048';
                end if;
                if cast(_val as pg_catalog.int4) operator(pg_catalog.<) 1 then
                    raise exception 'batch_size must be greater than 0';
                end if;
            end if;

            _val = pg_catalog.jsonb_extract_path(config, 'concurrency');
            if _val is not null then
                if pg_catalog.jsonb_typeof(_val) operator(pg_catalog.!=) 'number' then
                    raise exception 'concurrency must be a number';
                end if;
                if cast(_val as pg_catalog.int4) operator(pg_catalog.>) 50 then
                    raise exception 'concurrency must be less than or equal to 50';
                end if;
                if cast(_val as pg_catalog.int4) operator(pg_catalog.<) 1 then
                    raise exception 'concurrency must be greater than 0';
                end if;
            end if;
        else
            if _implementation is null then
                raise exception 'processing implementation not specified';
            else
                raise exception 'unrecognized processing implementation: "%"', _implementation;
            end if;
    end case;
end
$$;


--
-- Name: _validate_scheduling(jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._validate_scheduling(config jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _config_type pg_catalog.text;
    _implementation pg_catalog.text;
begin
    if pg_catalog.jsonb_typeof(config) operator(pg_catalog.!=) 'object' then
        raise exception 'scheduling config is not a jsonb object';
    end if;

    _config_type = config operator(pg_catalog.->>) 'config_type';
    if _config_type is null or _config_type operator(pg_catalog.!=) 'scheduling' then
        raise exception 'invalid config_type for scheduling config';
    end if;
    _implementation = config operator(pg_catalog.->>) 'implementation';
    case _implementation
        when 'none' then
            -- ok
        when 'timescaledb' then
            -- ok
        else
            if _implementation is null then
                raise exception 'scheduling implementation not specified';
            else
                raise exception 'unrecognized scheduling implementation: "%"', _implementation;
            end if;
    end case;
end
$$;


--
-- Name: _vectorizer_add_embedding_column(name, name, integer, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_add_embedding_column(source_schema name, source_table name, dimensions integer, embedding_column name) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _sql pg_catalog.text;
    _column_exists pg_catalog.bool;
begin
    -- Check if embedding column already exists
    select exists(
        select 1 
        from pg_catalog.pg_attribute a
        join pg_catalog.pg_class c on a.attrelid = c.oid
        join pg_catalog.pg_namespace n on c.relnamespace = n.oid
        where n.nspname = source_schema
        and c.relname = source_table
        and a.attname = embedding_column
        and not a.attisdropped
    ) into _column_exists;

    if _column_exists then
        raise notice 'embedding column %I already exists in %I.%I skipping creation', embedding_column, source_schema, source_table;
        return;
    else
        -- Add embedding column to source table
        select pg_catalog.format(
            $sql$
            alter table %I.%I 
            add column %I public.vector(%L) default null
            $sql$,
            source_schema, source_table, embedding_column, dimensions
        ) into strict _sql;

        execute _sql;

        select pg_catalog.format(
            $sql$alter table %I.%I alter column %I set storage main$sql$,
            source_schema, source_table, embedding_column
        ) into strict _sql;

        execute _sql;
    end if;
end;
$_$;


--
-- Name: _vectorizer_build_trigger_definition(name, name, name, name, name, name, jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_build_trigger_definition(queue_schema name, queue_table name, target_schema name, target_table name, source_schema name, source_table name, source_pk jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _pk_change_check pg_catalog.text;
    _delete_statement pg_catalog.text;
    _pk_columns pg_catalog.text;
    _pk_values pg_catalog.text;
    _func_def pg_catalog.text;
    _relevant_columns_check pg_catalog.text;
    _truncate_statement pg_catalog.text;
begin
    -- Pre-calculate all the parts we need
    select pg_catalog.string_agg(pg_catalog.format('%I', x.attname), ', ' order by x.attnum)
    into strict _pk_columns
    from pg_catalog.jsonb_to_recordset(source_pk) x(attnum int, attname name);

    select pg_catalog.string_agg(pg_catalog.format('new.%I', x.attname), ', ' order by x.attnum)
    into strict _pk_values
    from pg_catalog.jsonb_to_recordset(source_pk) x(attnum int, attname name);

    if target_schema is not null and target_table is not null then
        -- Create delete statement for deleted rows
        _delete_statement := format('delete from %I.%I where %s', target_schema, target_table,
            (select string_agg(format('%I = old.%I', attname, attname), ' and ')
            from pg_catalog.jsonb_to_recordset(source_pk) x(attnum int, attname name)));

        -- Create the primary key change check expression
        select string_agg(
            format('old.%I IS DISTINCT FROM new.%I', attname, attname),
            ' OR '
        )
        into strict _pk_change_check
        from pg_catalog.jsonb_to_recordset(source_pk) x(attnum int, attname name);

        _truncate_statement := format('truncate table %I.%I; truncate table %I.%I',
                                target_schema, target_table, queue_schema, queue_table);
    end if;

    _relevant_columns_check := 
        pg_catalog.format('EXISTS (
            SELECT 1 FROM pg_catalog.jsonb_each(to_jsonb(old)) AS o(key, value)
            JOIN pg_catalog.jsonb_each(to_jsonb(new)) AS n(key, value) 
            ON o.key = n.key
            WHERE o.value IS DISTINCT FROM n.value
            AND o.key != ALL(
                SELECT config operator(pg_catalog.->) ''destination'' operator(pg_catalog.->>) ''embedding_column''
                FROM ai.vectorizer 
                WHERE source_table = %L AND source_schema = %L
                AND config operator(pg_catalog.->) ''destination'' operator(pg_catalog.->>) ''implementation'' operator(pg_catalog.=) ''column''
            )
        )', source_table, source_schema);

    if target_schema is not null and target_table is not null then
        _func_def := $def$
        begin
            if (TG_LEVEL = 'ROW') then
                if (TG_OP = 'DELETE') then
                    $DELETE_STATEMENT$;
                elsif (TG_OP = 'UPDATE') then
                    -- Check if the primary key has changed and queue the update
                    if $PK_CHANGE_CHECK$ then
                        $DELETE_STATEMENT$;
                        insert into $QUEUE_SCHEMA$.$QUEUE_TABLE$ ($PK_COLUMNS$)
                            values ($PK_VALUES$);
                    -- check if a relevant column has changed and queue the update
                    elsif $RELEVANT_COLUMNS_CHECK$ then
                        insert into $QUEUE_SCHEMA$.$QUEUE_TABLE$ ($PK_COLUMNS$)
                        values ($PK_VALUES$);
                    end if;

                    return new;
                else
                    insert into $QUEUE_SCHEMA$.$QUEUE_TABLE$ ($PK_COLUMNS$)
                    values ($PK_VALUES$);
                    return new;
                end if;

            elsif (TG_LEVEL = 'STATEMENT') then
                if (TG_OP = 'TRUNCATE') then
                    $TRUNCATE_STATEMENT$;
                end if;
                return null;
            end if;

            return null;
        end;
        $def$;

        -- Replace placeholders
        _func_def := replace(_func_def, '$DELETE_STATEMENT$', _delete_statement);
        _func_def := replace(_func_def, '$PK_CHANGE_CHECK$', _pk_change_check);
        _func_def := replace(_func_def, '$QUEUE_SCHEMA$', quote_ident(queue_schema));
        _func_def := replace(_func_def, '$QUEUE_TABLE$', quote_ident(queue_table));
        _func_def := replace(_func_def, '$PK_COLUMNS$', _pk_columns);
        _func_def := replace(_func_def, '$PK_VALUES$', _pk_values);
        _func_def := replace(_func_def, '$TARGET_SCHEMA$', quote_ident(target_schema));
        _func_def := replace(_func_def, '$TARGET_TABLE$', quote_ident(target_table));
        _func_def := replace(_func_def, '$RELEVANT_COLUMNS_CHECK$', _relevant_columns_check);
        _func_def := replace(_func_def, '$TRUNCATE_STATEMENT$', _truncate_statement);
    
    else
        _func_def := $def$
        begin
            if (TG_LEVEL = 'ROW') then
                if (TG_OP = 'UPDATE') then
                    if $RELEVANT_COLUMNS_CHECK$ then
                        insert into $QUEUE_SCHEMA$.$QUEUE_TABLE$ ($PK_COLUMNS$)
                        values ($PK_VALUES$);
                    end if;
                elseif (TG_OP = 'INSERT') then
                    insert into $QUEUE_SCHEMA$.$QUEUE_TABLE$ ($PK_COLUMNS$)
                    values ($PK_VALUES$);
                end if;
            end if;
            return null;
        end;
        $def$;
        _func_def := replace(_func_def, '$RELEVANT_COLUMNS_CHECK$', _relevant_columns_check);
        _func_def := replace(_func_def, '$QUEUE_SCHEMA$', quote_ident(queue_schema));
        _func_def := replace(_func_def, '$QUEUE_TABLE$', quote_ident(queue_table));
        _func_def := replace(_func_def, '$PK_COLUMNS$', _pk_columns);
        _func_def := replace(_func_def, '$PK_VALUES$', _pk_values);
    end if;
    return _func_def;
end;
$_$;


--
-- Name: _vectorizer_create_destination_column(name, name, integer, jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_create_destination_column(source_schema name, source_table name, dimensions integer, destination jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    embedding_column pg_catalog.name;
begin
    embedding_column = destination operator(pg_catalog.->>) 'embedding_column';
    perform ai._vectorizer_add_embedding_column
    ( source_schema
    , source_table
    , dimensions
    , embedding_column
    );
end;
$$;


--
-- Name: _vectorizer_create_destination_table(name, name, jsonb, integer, jsonb, name[]); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_create_destination_table(source_schema name, source_table name, source_pk jsonb, dimensions integer, destination jsonb, grant_to name[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    target_schema pg_catalog.name;
    target_table pg_catalog.name;
    view_schema pg_catalog.name;
    view_name pg_catalog.name;
begin

    target_schema = destination operator(pg_catalog.->>) 'target_schema';
    target_table = destination operator(pg_catalog.->>) 'target_table';
    view_schema = destination operator(pg_catalog.->>) 'view_schema';
    view_name = destination operator(pg_catalog.->>) 'view_name';

    -- create the target table
    perform ai._vectorizer_create_target_table
    ( source_pk
    , target_schema
    , target_table
    , dimensions
    , grant_to
    );

    perform ai._vectorizer_create_view
    ( view_schema
    , view_name
    , source_schema
    , source_table
    , source_pk
    , target_schema
    , target_table
    , grant_to
    );
end;
$$;


--
-- Name: _vectorizer_create_queue_failed_table(name, name, jsonb, name[]); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_create_queue_failed_table(queue_schema name, queue_failed_table name, source_pk jsonb, grant_to name[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _sql pg_catalog.text;
begin
    -- create the table
    select pg_catalog.format
    ( $sql$
      create table %I.%I
      ( %s
      , created_at pg_catalog.timestamptz not null default now()
      , failure_step pg_catalog.text not null default ''
      )
      $sql$
    , queue_schema, queue_failed_table
    , (
        select pg_catalog.string_agg
        (
          pg_catalog.format
          ( '%I %s not null'
          , x.attname
          , x.typname
          )
          , E'\n, '
          order by x.attnum
        )
        from pg_catalog.jsonb_to_recordset(source_pk) x(attnum int, attname name, typname name)
      )
    ) into strict _sql
    ;
    execute _sql;

    -- create the index
    select pg_catalog.format
    ( $sql$create index on %I.%I (%s)$sql$
    , queue_schema, queue_failed_table
    , (
        select pg_catalog.string_agg(pg_catalog.format('%I', x.attname), ', ' order by x.pknum)
        from pg_catalog.jsonb_to_recordset(source_pk) x(pknum int, attname name)
      )
    ) into strict _sql
    ;
    execute _sql;

    if grant_to is not null then
        -- grant usage on queue schema to grant_to roles
        select pg_catalog.format
        ( $sql$grant usage on schema %I to %s$sql$
        , queue_schema
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;

        -- grant select, update, delete on queue table to grant_to roles
        select pg_catalog.format
        ( $sql$grant select, insert, update, delete on %I.%I to %s$sql$
        , queue_schema
        , queue_failed_table
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;
    end if;
end;
$_$;


--
-- Name: _vectorizer_create_queue_table(name, name, jsonb, name[]); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_create_queue_table(queue_schema name, queue_table name, source_pk jsonb, grant_to name[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _sql pg_catalog.text;
begin
    -- create the table
    select pg_catalog.format
    ( $sql$
      create table %I.%I
      ( %s
      , queued_at pg_catalog.timestamptz not null default now()
      , loading_retries pg_catalog.int4 not null default 0
      , loading_retry_after pg_catalog.timestamptz
      )
      $sql$
    , queue_schema, queue_table
    , (
        select pg_catalog.string_agg
        (
          pg_catalog.format
          ( '%I %s not null'
          , x.attname
          , x.typname
          )
          , E'\n, '
          order by x.attnum
        )
        from pg_catalog.jsonb_to_recordset(source_pk) x(attnum int, attname name, typname name)
      )
    ) into strict _sql
    ;
    execute _sql;

    -- create the index
    select pg_catalog.format
    ( $sql$create index on %I.%I (%s)$sql$
    , queue_schema, queue_table
    , (
        select pg_catalog.string_agg(pg_catalog.format('%I', x.attname), ', ' order by x.pknum)
        from pg_catalog.jsonb_to_recordset(source_pk) x(pknum int, attname name)
      )
    ) into strict _sql
    ;
    execute _sql;

    if grant_to is not null then
        -- grant usage on queue schema to grant_to roles
        select pg_catalog.format
        ( $sql$grant usage on schema %I to %s$sql$
        , queue_schema
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;

        -- grant select, update, delete on queue table to grant_to roles
        select pg_catalog.format
        ( $sql$grant select, insert, update, delete on %I.%I to %s$sql$
        , queue_schema
        , queue_table
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;
    end if;
end;
$_$;


--
-- Name: _vectorizer_create_source_trigger(name, name, name, name, name, name, name, jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_create_source_trigger(trigger_name name, queue_schema name, queue_table name, source_schema name, source_table name, target_schema name, target_table name, source_pk jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _sql pg_catalog.text;
begin
    
    execute format
    ( $sql$
    create function %I.%I() returns trigger 
    as $trigger_def$ 
    %s
    $trigger_def$ language plpgsql volatile parallel safe security definer 
    set search_path to pg_catalog, pg_temp
    $sql$
    , queue_schema
    , trigger_name
    , ai._vectorizer_build_trigger_definition(queue_schema,
                                              queue_table,
                                              target_schema,
                                              target_table,
                                              source_schema,
                                              source_table,
                                              source_pk)
    );

    -- Revoke public permissions
    _sql := pg_catalog.format(
        'revoke all on function %I.%I() from public',
        queue_schema, trigger_name
    );
    execute _sql;

    -- Create the row-level trigger
    select pg_catalog.format(
        $sql$
        create trigger %I
        after insert or update or delete
        on %I.%I
        for each row execute function %I.%I()
        $sql$,
        trigger_name,
        source_schema, source_table,
        queue_schema, trigger_name
    ) into strict _sql
    ;
    execute _sql;
    
    -- Create the statement-level trigger for TRUNCATE
    -- Note: Using the same trigger function but with a different event and level
    select pg_catalog.format(
        $sql$
        create trigger %I_truncate
        after truncate
        on %I.%I
        for each statement execute function %I.%I()
        $sql$,
        trigger_name,
        source_schema, source_table,
        queue_schema, trigger_name
    ) into strict _sql
    ;
    execute _sql;
end;
$_$;


--
-- Name: _vectorizer_create_target_table(jsonb, name, name, integer, name[]); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_create_target_table(source_pk jsonb, target_schema name, target_table name, dimensions integer, grant_to name[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _pk_cols pg_catalog.text;
    _sql pg_catalog.text;
begin
    select pg_catalog.string_agg(pg_catalog.format('%I', x.attname), ', ' order by x.pknum)
    into strict _pk_cols
    from pg_catalog.jsonb_to_recordset(source_pk) x(pknum int, attname name)
    ;

    select pg_catalog.format
    ( $sql$
    create table %I.%I
    ( embedding_uuid uuid not null primary key default pg_catalog.gen_random_uuid()
    , %s
    , chunk_seq int not null
    , chunk text not null
    , embedding public.vector(%L) not null
    , unique (%s, chunk_seq)
    )
    $sql$
    , target_schema, target_table
    , (
        select pg_catalog.string_agg
        (
            pg_catalog.format
            ( '%I %s not null'
            , x.attname
            , x.typname
            )
            , E'\n, '
            order by x.attnum
        )
        from pg_catalog.jsonb_to_recordset(source_pk)
            x(attnum int, attname name, typname name)
      )
    , dimensions
    , _pk_cols
    ) into strict _sql
    ;
    execute _sql;

    select pg_catalog.format
       ( $sql$alter table %I.%I alter column embedding set storage main$sql$
       , target_schema
       , target_table
       ) into strict _sql
    ;
    execute _sql;

    if grant_to is not null then
        -- grant usage on target schema to grant_to roles
        select pg_catalog.format
        ( $sql$grant usage on schema %I to %s$sql$
        , target_schema
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;

        -- grant select, insert, update on target table to grant_to roles
        select pg_catalog.format
        ( $sql$grant select, insert, update on %I.%I to %s$sql$
        , target_schema
        , target_table
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;
    end if;
end;
$_$;


--
-- Name: _vectorizer_create_vector_index(name, name, jsonb, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_create_vector_index(target_schema name, target_table name, indexing jsonb, column_name name DEFAULT 'embedding'::name) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _key1 pg_catalog.int4 = 1982010642;
    _key2 pg_catalog.int4;
    _implementation pg_catalog.text;
    _with_count pg_catalog.int8;
    _with pg_catalog.text;
    _ext_schema pg_catalog.name;
    _sql pg_catalog.text;
begin

    -- use the target table's oid as the second key for the advisory lock
    select k.oid::pg_catalog.int4 into strict _key2
    from pg_catalog.pg_class k
    inner join pg_catalog.pg_namespace n on (k.relnamespace operator(pg_catalog.=) n.oid)
    where k.relname operator(pg_catalog.=) target_table
    and n.nspname operator(pg_catalog.=) target_schema
    ;

    -- try to grab a transaction-level advisory lock specific to the target table
    -- if we get it, no one else is building the vector index. proceed
    -- if we don't get it, someone else is already working on it. abort
    if not pg_catalog.pg_try_advisory_xact_lock(_key1, _key2) then
        raise warning 'another process is already building a vector index on %.%', target_schema, target_table;
        return;
    end if;

    -- double-check that the index doesn't exist now that we're holding the advisory lock
    -- nobody likes redundant indexes
    if ai._vectorizer_vector_index_exists(target_schema, target_table, indexing, column_name) then
        raise notice 'the vector index on %.% already exists', target_schema, target_table;
        return;
    end if;

    _implementation = pg_catalog.jsonb_extract_path_text(indexing, 'implementation');
    case _implementation
        when 'diskann' then
            select
              pg_catalog.count(*)
            , pg_catalog.string_agg
              ( case w.key
                  when 'storage_layout' then pg_catalog.format('%s=%L', w.key, w.value)
                  when 'max_alpha' then pg_catalog.format('%s=%s', w.key, w.value::pg_catalog.float8)
                  else pg_catalog.format('%s=%s', w.key, w.value::pg_catalog.int4)
                end
              , ', '
              )
            into strict
              _with_count
            , _with
            from pg_catalog.jsonb_each_text(indexing) w
            where w.key in
            ( 'storage_layout'
            , 'num_neighbors'
            , 'search_list_size'
            , 'max_alpha'
            , 'num_dimensions'
            , 'num_bits_per_dimension'
            )
            ;

            select pg_catalog.format
            ( $sql$create index on %I.%I using diskann (%I)%s$sql$
            , target_schema, target_table
            , column_name
            , case when _with_count operator(pg_catalog.>) 0
                then pg_catalog.format(' with (%s)', _with)
                else ''
              end
            ) into strict _sql;
            execute _sql;
        when 'hnsw' then
            select
              pg_catalog.count(*)
            , pg_catalog.string_agg(pg_catalog.format('%s=%s', w.key, w.value::pg_catalog.int4), ', ')
            into strict
              _with_count
            , _with
            from pg_catalog.jsonb_each_text(indexing) w
            where w.key in ('m', 'ef_construction')
            ;

            select n.nspname into strict _ext_schema
            from pg_catalog.pg_extension x
            inner join pg_catalog.pg_namespace n on (x.extnamespace operator(pg_catalog.=) n.oid)
            where x.extname operator(pg_catalog.=) 'vector'
            ;

            select pg_catalog.format
            ( $sql$create index on %I.%I using hnsw (%I %I.%s)%s$sql$
            , target_schema, target_table
            , column_name
            , _ext_schema
            , indexing operator(pg_catalog.->>) 'opclass'
            , case when _with_count operator(pg_catalog.>) 0
                then pg_catalog.format(' with (%s)', _with)
                else ''
              end
            ) into strict _sql;
            execute _sql;
        else
            raise exception 'unrecognized index implementation: %s', _implementation;
    end case;
end
$_$;


--
-- Name: _vectorizer_create_view(name, name, name, name, jsonb, name, name, name[]); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_create_view(view_schema name, view_name name, source_schema name, source_table name, source_pk jsonb, target_schema name, target_table name, grant_to name[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _sql pg_catalog.text;
begin
    select pg_catalog.format
    ( $sql$
    create view %I.%I as
    select
      t.embedding_uuid
    , t.chunk_seq
    , t.chunk
    , t.embedding
    , %s
    from %I.%I t
    left outer join %I.%I s
    on (%s)
    $sql$
    , view_schema, view_name
    , (
        -- take primary keys from the target table and other columns from source
        -- this allows for join removal optimization
        select pg_catalog.string_agg
        (
            pg_catalog.format
            ( '%s.%I'
            , case when x.attnum is not null then 't' else 's' end
            , a.attname
            )
            , E'\n    , '
            order by a.attnum
        )
        from pg_catalog.pg_attribute a
        left outer join pg_catalog.jsonb_to_recordset(source_pk) x(attnum int) on (a.attnum operator(pg_catalog.=) x.attnum)
        where a.attrelid operator(pg_catalog.=) pg_catalog.format('%I.%I', source_schema, source_table)::pg_catalog.regclass::pg_catalog.oid
        and a.attnum operator(pg_catalog.>) 0
        and not a.attisdropped
      )
    , target_schema, target_table
    , source_schema, source_table
    , (
        select pg_catalog.string_agg
        (
            pg_catalog.format
            ( 't.%s = s.%s'
            , x.attname
            , x.attname
            )
            , ' and '
            order by x.pknum
        )
        from pg_catalog.jsonb_to_recordset(source_pk)
            x(pknum int, attname name)
      )
    ) into strict _sql;
    execute _sql;

    if grant_to is not null then
        -- grant usage on view schema to grant_to roles
        select pg_catalog.format
        ( $sql$grant usage on schema %I to %s$sql$
        , view_schema
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;

        -- grant select on view to grant_to roles
        select pg_catalog.format
        ( $sql$grant select on %I.%I to %s$sql$
        , view_schema
        , view_name
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;
    end if;
end
$_$;


--
-- Name: _vectorizer_grant_to_source(name, name, name[]); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_grant_to_source(source_schema name, source_table name, grant_to name[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _sql pg_catalog.text;
begin
    if grant_to is not null then
        -- grant usage on source schema to grant_to roles
        select pg_catalog.format
        ( $sql$grant usage on schema %I to %s$sql$
        , source_schema
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;

        -- grant select on source table to grant_to roles
        select pg_catalog.format
        ( $sql$grant select on %I.%I to %s$sql$
        , source_schema
        , source_table
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;
    end if;
end;
$_$;


--
-- Name: _vectorizer_grant_to_vectorizer(name[]); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_grant_to_vectorizer(grant_to name[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _sql pg_catalog.text;
begin
    if grant_to is not null then
        -- grant usage on schema ai to grant_to roles
        select pg_catalog.format
        ( $sql$grant usage on schema ai to %s$sql$
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;

        -- grant select on vectorizer table to grant_to roles
        select pg_catalog.format
        ( $sql$grant select on ai.vectorizer to %s$sql$
        , (
            select pg_catalog.string_agg(pg_catalog.quote_ident(x), ', ')
            from pg_catalog.unnest(grant_to) x
          )
        ) into strict _sql;
        execute _sql;
    end if;
end;
$_$;


--
-- Name: _vectorizer_job(integer, jsonb); Type: PROCEDURE; Schema: ai; Owner: -
--

CREATE PROCEDURE ai._vectorizer_job(IN job_id integer DEFAULT NULL::integer, IN config jsonb DEFAULT NULL::jsonb)
    LANGUAGE plpgsql
    AS $_$
declare
    _vectorizer_id pg_catalog.int4;
    _vec ai.vectorizer%rowtype;
    _sql pg_catalog.text;
    _found pg_catalog.bool;
    _count pg_catalog.int8;
    _should_create_vector_index pg_catalog.bool;
begin
    set local search_path = pg_catalog, pg_temp;
    if config is null then
        raise exception 'config is null';
    end if;

    -- get the vectorizer id from the config
    select pg_catalog.jsonb_extract_path_text(config, 'vectorizer_id')::pg_catalog.int4
    into strict _vectorizer_id
    ;

    -- get the vectorizer
    select * into strict _vec
    from ai.vectorizer v
    where v.id operator(pg_catalog.=) _vectorizer_id
    ;

    commit;
    set local search_path = pg_catalog, pg_temp;

    _should_create_vector_index = ai._vectorizer_should_create_vector_index(_vec);

    -- if the conditions are right, create the vectorizer index
    if _should_create_vector_index and _vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'implementation' operator(pg_catalog.=) 'table' then
        commit;
        set local search_path = pg_catalog, pg_temp;
        perform ai._vectorizer_create_vector_index
        (_vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'target_schema'
        , _vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'target_table'
        , pg_catalog.jsonb_extract_path(_vec.config, 'indexing')
        );
    elsif _should_create_vector_index and _vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'implementation' operator(pg_catalog.=) 'column' then
        commit;
        set local search_path = pg_catalog, pg_temp;
        perform ai._vectorizer_create_vector_index
        (_vec.source_schema
        , _vec.source_table
        , pg_catalog.jsonb_extract_path(_vec.config, 'indexing')
        , _vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'embedding_column'
        );
    end if;

    commit;
    set local search_path = pg_catalog, pg_temp;

    -- if there is at least one item in the queue, we need to execute the vectorizer
    select pg_catalog.format
    ( $sql$
    select true
    from %I.%I
    for update skip locked
    limit 1
    $sql$
    , _vec.queue_schema, _vec.queue_table
    ) into strict _sql
    ;
    execute _sql into _found;
    commit;
    set local search_path = pg_catalog, pg_temp;
    if coalesce(_found, false) is true then
        -- count total items in the queue
        select pg_catalog.format
        ( $sql$select pg_catalog.count(1) from (select 1 from %I.%I limit 501) $sql$
        , _vec.queue_schema, _vec.queue_table
        ) into strict _sql
        ;
        execute _sql into strict _count;
        commit;
        set local search_path = pg_catalog, pg_temp;
        -- for every 50 items in the queue, execute a vectorizer max out at 10 vectorizers
        _count = least(pg_catalog.ceil(_count::pg_catalog.float8 / 50.0::pg_catalog.float8), 10::pg_catalog.float8)::pg_catalog.int8;
        raise debug 'job_id %: executing % vectorizers...', job_id, _count;
        while _count > 0 loop
            -- execute the vectorizer
            perform ai.execute_vectorizer(_vectorizer_id);
            _count = _count - 1;
        end loop;
    end if;
    commit;
    set local search_path = pg_catalog, pg_temp;
end
$_$;


--
-- Name: _vectorizer_schedule_job(integer, jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_schedule_job(vectorizer_id integer, scheduling jsonb) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _implementation pg_catalog.text;
    _sql pg_catalog.text;
    _extension_schema pg_catalog.name;
    _job_id pg_catalog.int8;
    _ai_extension_exists pg_catalog.bool;
begin
    select pg_catalog.jsonb_extract_path_text(scheduling, 'implementation')
    into strict _implementation
    ;
    case
        when _implementation operator(pg_catalog.=) 'timescaledb' then
            select pg_catalog.count(*) > 0
            into strict _ai_extension_exists
            from pg_catalog.pg_extension x
            where x.extname operator(pg_catalog.=) 'ai';
            
            if not _ai_extension_exists then
                raise exception 'ai extension not found but it is needed for timescaledb scheduling.';
            end if;
            -- look up schema/name of the extension for scheduling. may be null
            select n.nspname into _extension_schema
            from pg_catalog.pg_extension x
            inner join pg_catalog.pg_namespace n on (x.extnamespace operator(pg_catalog.=) n.oid)
            where x.extname operator(pg_catalog.=) _implementation
            ;
            if _extension_schema is null then
                raise exception 'timescaledb extension not found';
            end if;
        when _implementation operator(pg_catalog.=) 'none' then
            return null;
        else
            raise exception 'scheduling implementation not recognized';
    end case;

    -- schedule the job using the implementation chosen
    case _implementation
        when 'timescaledb' then
            -- schedule the work proc with timescaledb background jobs
            select pg_catalog.format
            ( $$select %I.add_job('ai._vectorizer_job'::pg_catalog.regproc, %s, config=>%L)$$
            , _extension_schema
            , ( -- gather up the arguments
                select pg_catalog.string_agg
                ( pg_catalog.format('%s=>%L', s.key, s.value)
                , ', '
                order by x.ord
                )
                from pg_catalog.jsonb_each_text(scheduling) s
                inner join
                pg_catalog.unnest(array['schedule_interval', 'initial_start', 'fixed_schedule', 'timezone']) with ordinality x(key, ord)
                on (s.key = x.key)
              )
            , pg_catalog.jsonb_build_object('vectorizer_id', vectorizer_id)::pg_catalog.text
            ) into strict _sql
            ;
            execute _sql into strict _job_id;
    end case;
    return _job_id;
end
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: vectorizer; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.vectorizer (
    id integer NOT NULL,
    source_schema name NOT NULL,
    source_table name NOT NULL,
    source_pk jsonb NOT NULL,
    trigger_name name NOT NULL,
    queue_schema name,
    queue_table name,
    config jsonb NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    queue_failed_table name,
    name name NOT NULL,
    CONSTRAINT vectorizer_name_check CHECK ((name ~ '^[a-z][a-z_0-9]*$'::text))
);


--
-- Name: _vectorizer_should_create_vector_index(ai.vectorizer); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_should_create_vector_index(vectorizer ai.vectorizer) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _indexing pg_catalog.jsonb;
    _implementation pg_catalog.text;
    _create_when_queue_empty pg_catalog.bool;
    _sql pg_catalog.text;
    _count pg_catalog.int8;
    _min_rows pg_catalog.int8;
    _schema_name pg_catalog.name;
    _table_name pg_catalog.name;
    _column_name pg_catalog.name;
begin
    -- grab the indexing config
    _indexing = pg_catalog.jsonb_extract_path(vectorizer.config, 'indexing');
    if _indexing is null then
        return false;
    end if;

    -- grab the indexing config's implementation
    _implementation = pg_catalog.jsonb_extract_path_text(_indexing, 'implementation');
    -- if implementation is missing or none, exit
    if _implementation is null or _implementation = 'none' then
        return false;
    end if;

    _schema_name = coalesce(vectorizer.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'target_schema', vectorizer.source_schema);
    _table_name = coalesce(vectorizer.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'target_table', vectorizer.source_table);
    _column_name = coalesce(vectorizer.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'embedding_column', 'embedding');
    -- see if the index already exists. if so, exit
    if ai._vectorizer_vector_index_exists(_schema_name, _table_name, _indexing, _column_name) then
        return false;
    end if;

    -- if flag set, only attempt to create the vector index if the queue table is empty
    _create_when_queue_empty = coalesce(pg_catalog.jsonb_extract_path(_indexing, 'create_when_queue_empty')::pg_catalog.bool, true);
    if _create_when_queue_empty then
        -- count the rows in the queue table
        select pg_catalog.format
        ( $sql$select pg_catalog.count(1) from %I.%I limit 1$sql$
        , vectorizer.queue_schema
        , vectorizer.queue_table
        ) into strict _sql
        ;
        execute _sql into _count;
        if _count operator(pg_catalog.>) 0 then
            raise notice 'queue for %.% is not empty. skipping vector index creation', _schema_name, _table_name;
            return false;
        end if;
    end if;

    -- if min_rows has a value
    _min_rows = coalesce(pg_catalog.jsonb_extract_path_text(_indexing, 'min_rows')::pg_catalog.int8, 0);
    if _min_rows > 0 then
        -- count the rows in the target table
        select pg_catalog.format
        ( $sql$select pg_catalog.count(*) from (select 1 from %I.%I limit %L) x$sql$
        , _schema_name
        , _table_name
        , _min_rows
        ) into strict _sql
        ;
        execute _sql into _count;
    end if;

    -- if we have met or exceeded min_rows, create the index
    return coalesce(_count, 0) >= _min_rows;
end
$_$;


--
-- Name: _vectorizer_source_pk(regclass); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_source_pk(source_table regclass) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select pg_catalog.jsonb_agg(x)
    from
    (
        select e.attnum, e.pknum, a.attname, pg_catalog.format_type(y.oid, a.atttypmod) as typname
        from pg_catalog.pg_constraint k
        cross join lateral pg_catalog.unnest(k.conkey) with ordinality e(attnum, pknum)
        inner join pg_catalog.pg_attribute a
            on (k.conrelid operator(pg_catalog.=) a.attrelid
                and e.attnum operator(pg_catalog.=) a.attnum)
        inner join pg_catalog.pg_type y on (a.atttypid operator(pg_catalog.=) y.oid)
        where k.conrelid operator(pg_catalog.=) source_table
        and k.contype operator(pg_catalog.=) 'p'
    ) x
$$;


--
-- Name: _vectorizer_vector_index_exists(name, name, jsonb, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._vectorizer_vector_index_exists(target_schema name, target_table name, indexing jsonb, column_name name DEFAULT 'embedding'::name) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _implementation pg_catalog.text;
    _found pg_catalog.bool;
begin
    _implementation = pg_catalog.jsonb_extract_path_text(indexing, 'implementation');
    if _implementation not in ('diskann', 'hnsw') then
        raise exception 'unrecognized index implementation: %s', _implementation;
    end if;

    -- look for an index on the target table where the indexed column is the "embedding" column
    -- and the index is using the correct implementation
    select pg_catalog.count(*) filter
    ( where pg_catalog.pg_get_indexdef(i.indexrelid)
      ilike pg_catalog.concat('% using ', _implementation, ' %')
    ) > 0 into _found
    from pg_catalog.pg_class k
    inner join pg_catalog.pg_namespace n on (k.relnamespace operator(pg_catalog.=) n.oid)
    inner join pg_index i on (k.oid operator(pg_catalog.=) i.indrelid)
    inner join pg_catalog.pg_attribute a
        on (k.oid operator(pg_catalog.=) a.attrelid
        and a.attname operator(pg_catalog.=) column_name
        and a.attnum operator(pg_catalog.=) i.indkey[0]
        )
    where n.nspname operator(pg_catalog.=) target_schema
    and k.relname operator(pg_catalog.=) target_table
    ;
    return coalesce(_found, false);
end
$$;


--
-- Name: _worker_heartbeat(uuid, integer, integer, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._worker_heartbeat(worker_id uuid, num_successes_since_last_heartbeat integer, num_errors_since_last_heartbeat integer, error_message text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
    heartbeat_timestamp timestamptz = clock_timestamp();
BEGIN
    UPDATE ai.vectorizer_worker_process SET 
          last_heartbeat = heartbeat_timestamp 
        , heartbeat_count = heartbeat_count + 1 
        , error_count = error_count + num_errors_since_last_heartbeat
        , success_count = success_count + num_successes_since_last_heartbeat
        , last_error_message = CASE WHEN error_message IS NOT NULL THEN error_message ELSE last_error_message END 
        , last_error_at = CASE WHEN error_message IS NOT NULL THEN heartbeat_timestamp ELSE last_error_at END 
    WHERE id = worker_id;
END;
$$;


--
-- Name: _worker_progress(uuid, integer, integer, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._worker_progress(worker_id uuid, worker_vectorizer_id integer, num_successes integer, error_message text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
    progress_timestamp timestamptz = clock_timestamp();
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ai.vectorizer_worker_progress WHERE vectorizer_id = worker_vectorizer_id) THEN
        --make sure a row exists for this vectorizer
        INSERT INTO ai.vectorizer_worker_progress (vectorizer_id) VALUES (worker_vectorizer_id) ON CONFLICT DO NOTHING;
    END IF;

    UPDATE ai.vectorizer_worker_progress SET 
        last_success_at = CASE WHEN error_message IS NULL THEN progress_timestamp ELSE last_success_at END
      , last_success_process_id = CASE WHEN error_message IS NULL THEN worker_id ELSE last_success_process_id END
      , last_error_at = CASE WHEN error_message IS NULL THEN last_error_at ELSE progress_timestamp END
      , last_error_message = CASE WHEN error_message IS NULL THEN last_error_message ELSE error_message END
      , last_error_process_id = CASE WHEN error_message IS NULL THEN last_error_process_id ELSE worker_id END
      , success_count = success_count + num_successes
      , error_count = error_count + CASE WHEN error_message IS NULL THEN 0 ELSE 1 END
    WHERE vectorizer_id = worker_vectorizer_id;
END;
$$;


--
-- Name: _worker_start(text, interval); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai._worker_start(version text, expected_heartbeat_interval interval) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
    worker_id uuid;
BEGIN
    --can add version check here
    INSERT INTO ai.vectorizer_worker_process (version, expected_heartbeat_interval) VALUES (version, expected_heartbeat_interval) RETURNING id INTO worker_id;
    RETURN worker_id;
END;
$$;


--
-- Name: auto_queue_trigger(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.auto_queue_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- Skip if content is too short
      IF LENGTH(NEW.content) < 10 THEN
        RETURN NEW;
      END IF;

      -- Queue for embedding generation
      PERFORM ai.queue_embedding(
        TG_TABLE_NAME,
        NEW.source_id::VARCHAR,
        NEW.content
      );

      RETURN NEW;
    END;
    $$;


--
-- Name: chunking_character_text_splitter(integer, integer, text, boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.chunking_character_text_splitter(chunk_size integer DEFAULT 800, chunk_overlap integer DEFAULT 400, separator text DEFAULT '

'::text, is_separator_regex boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'character_text_splitter'
    , 'config_type', 'chunking'
    , 'chunk_size', chunk_size
    , 'chunk_overlap', chunk_overlap
    , 'separator', separator
    , 'is_separator_regex', is_separator_regex
    ))
$$;


--
-- Name: chunking_none(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.chunking_none() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_build_object
    ( 'implementation', 'none'
    , 'config_type', 'chunking'
    )
$$;


--
-- Name: chunking_recursive_character_text_splitter(integer, integer, text[], boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.chunking_recursive_character_text_splitter(chunk_size integer DEFAULT 800, chunk_overlap integer DEFAULT 400, separators text[] DEFAULT ARRAY['

'::text, '
'::text, '.'::text, '?'::text, '!'::text, ' '::text, ''::text], is_separator_regex boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'recursive_character_text_splitter'
    , 'config_type', 'chunking'
    , 'chunk_size', chunk_size
    , 'chunk_overlap', chunk_overlap
    , 'separators', separators
    , 'is_separator_regex', is_separator_regex
    ))
$$;


--
-- Name: embedding_sentence_transformers(text, integer); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.embedding_sentence_transformers(model text DEFAULT 'nomic-ai/nomic-embed-text-v1.5'::text, dimensions integer DEFAULT 768) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_build_object
    ( 'implementation', 'sentence_transformers'
    , 'config_type', 'embedding'
    , 'model', model
    , 'dimensions', dimensions
    )
$$;


--
-- Name: create_semantic_catalog(name, name, jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.create_semantic_catalog(catalog_name name DEFAULT 'default'::name, embedding_name name DEFAULT NULL::name, embedding_config jsonb DEFAULT ai.embedding_sentence_transformers()) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _catalog_name name = create_semantic_catalog.catalog_name;
    _embedding_name name = create_semantic_catalog.embedding_name;
    _embedding_config jsonb = create_semantic_catalog.embedding_config;
    _catalog_id int4;
    _sql text;
begin
    select nextval('ai.semantic_catalog_id_seq')
    into strict _catalog_id
    ;

    insert into ai.semantic_catalog
    ( id
    , catalog_name
    , obj_table
    , sql_table
    , fact_table
    )
    values 
    ( _catalog_id
    , catalog_name
    , array['ai', format('semantic_catalog_obj_%s', _catalog_id)]
    , array['ai', format('semantic_catalog_sql_%s', _catalog_id)]
    , array['ai', format('semantic_catalog_fact_%s', _catalog_id)]
    )
    ;
    
    -- create the table for database objects
    _sql = format
    ( $sql$
        create table ai.semantic_catalog_obj_%s
        ( id int8 not null primary key generated by default as identity
        , classid oid not null
        , objid oid not null
        , objsubid int4 not null
        , objtype text not null
        , objnames text[] not null
        , objargs text[] not null
        , description text
        , usage int8 not null default 0
        , unique (classid, objid, objsubid) deferrable initially immediate
        , unique (objtype, objnames, objargs) deferrable initially immediate
        )
      $sql$
    , _catalog_id
    );
    raise debug '%', _sql;
    execute _sql;
    
    -- create the table for example sql
    _sql = format
    ( $sql$
        create table ai.semantic_catalog_sql_%s
        ( id int8 not null primary key generated by default as identity
        , sql text not null
        , description text not null
        , usage int8 not null default 0
        )
      $sql$
    , _catalog_id
    );
    raise debug '%', _sql;
    execute _sql;
    
    -- create the table for facts
    _sql = format
    ( $sql$
        create table ai.semantic_catalog_fact_%s
        ( id int8 not null primary key generated by default as identity
        , description text not null
        , usage int8 not null default 0
        )
      $sql$
    , _catalog_id
    );
    raise debug '%', _sql;
    execute _sql;
    
    perform ai.sc_add_embedding
    ( embedding_name=>_embedding_name
    , config=>_embedding_config
    , catalog_name=>_catalog_name
    );
    
    return _catalog_id;
end;
$_$;


--
-- Name: destination_table(name, name, name, name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.destination_table(destination name DEFAULT NULL::name, target_schema name DEFAULT NULL::name, target_table name DEFAULT NULL::name, view_schema name DEFAULT NULL::name, view_name name DEFAULT NULL::name) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'table'
    , 'config_type', 'destination'
    , 'destination', destination
    , 'target_schema', target_schema
    , 'target_table', target_table
    , 'view_schema', view_schema
    , 'view_name', view_name
    ))
$$;


--
-- Name: formatting_python_template(text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.formatting_python_template(template text DEFAULT '$chunk'::text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'python_template'
    , 'config_type', 'formatting'
    , 'template', template
    ))
$$;


--
-- Name: grant_to(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.grant_to() RETURNS name[]
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.grant_to(variadic array[]::pg_catalog.name[])
$$;


--
-- Name: indexing_default(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.indexing_default() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select jsonb_build_object
    ( 'implementation', 'default'
    , 'config_type', 'indexing'
    )
$$;


--
-- Name: parsing_auto(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.parsing_auto() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_build_object
    ( 'implementation', 'auto'
    , 'config_type', 'parsing'
    )
$$;


--
-- Name: processing_default(integer, integer); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.processing_default(batch_size integer DEFAULT NULL::integer, concurrency integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'default'
    , 'config_type', 'processing'
    , 'batch_size', batch_size
    , 'concurrency', concurrency
    ))
$$;


--
-- Name: scheduling_default(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.scheduling_default() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select pg_catalog.jsonb_build_object
    ( 'implementation', 'default'
    , 'config_type', 'scheduling'
    )
$$;


--
-- Name: create_vectorizer(regclass, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, name, name, name[], boolean, boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.create_vectorizer(source regclass, name text DEFAULT NULL::text, destination jsonb DEFAULT ai.destination_table(), loading jsonb DEFAULT NULL::jsonb, parsing jsonb DEFAULT ai.parsing_auto(), embedding jsonb DEFAULT NULL::jsonb, chunking jsonb DEFAULT ai.chunking_recursive_character_text_splitter(), indexing jsonb DEFAULT ai.indexing_default(), formatting jsonb DEFAULT ai.formatting_python_template(), scheduling jsonb DEFAULT ai.scheduling_default(), processing jsonb DEFAULT ai.processing_default(), queue_schema name DEFAULT NULL::name, queue_table name DEFAULT NULL::name, grant_to name[] DEFAULT ai.grant_to(), enqueue_existing boolean DEFAULT true, if_not_exists boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _missing_roles pg_catalog.name[];
    _source_table pg_catalog.name;
    _source_schema pg_catalog.name;
    _trigger_name pg_catalog.name;
    _is_owner pg_catalog.bool;
    _dimensions pg_catalog.int4;
    _source_pk pg_catalog.jsonb;
    _vectorizer_id pg_catalog.int4;
    _existing_vectorizer_id pg_catalog.int4;
    _sql pg_catalog.text;
    _job_id pg_catalog.int8;
    _queue_failed_table pg_catalog.name;
begin
    -- make sure all the roles listed in grant_to exist
    if grant_to is not null then
        select
          pg_catalog.array_agg(r) filter (where r operator(pg_catalog.!=) 'public' and pg_catalog.to_regrole(r) is null) -- missing
        , pg_catalog.array_agg(r) filter (where r operator(pg_catalog.=) 'public' or pg_catalog.to_regrole(r) is not null) -- real roles
        into strict
          _missing_roles
        , grant_to
        from pg_catalog.unnest(grant_to) r
        ;
        if pg_catalog.array_length(_missing_roles, 1) operator(pg_catalog.>) 0 then
            raise warning 'one or more grant_to roles do not exist: %', _missing_roles;
        end if;
    end if;

    if embedding is null then
        raise exception 'embedding configuration is required';
    end if;

    if loading is null then
        raise exception 'loading configuration is required';
    end if;

    -- get source table name and schema name
    select
      k.relname
    , n.nspname
    , pg_catalog.pg_has_role(pg_catalog.current_user(), k.relowner, 'MEMBER')
    into strict _source_table, _source_schema, _is_owner
    from pg_catalog.pg_class k
    inner join pg_catalog.pg_namespace n on (k.relnamespace operator(pg_catalog.=) n.oid)
    where k.oid operator(pg_catalog.=) source
    ;
    -- not an owner of the table, but superuser?
    if not _is_owner then
        select r.rolsuper into strict _is_owner
        from pg_catalog.pg_roles r
        where r.rolname operator(pg_catalog.=) pg_catalog.current_user()
        ;
    end if;

    if not _is_owner then
        raise exception 'only a superuser or the owner of the source table may create a vectorizer on it';
    end if;

    select (embedding operator(pg_catalog.->) 'dimensions')::pg_catalog.int4 into _dimensions;
    if _dimensions is null then
        raise exception 'dimensions argument is required';
    end if;

    -- get the source table's primary key definition
    select ai._vectorizer_source_pk(source) into strict _source_pk;
    if _source_pk is null or pg_catalog.jsonb_array_length(_source_pk) operator(pg_catalog.=) 0 then
        raise exception 'source table must have a primary key constraint';
    end if;

    _vectorizer_id = pg_catalog.nextval('ai.vectorizer_id_seq'::pg_catalog.regclass);
    _trigger_name = pg_catalog.concat('_vectorizer_src_trg_', _vectorizer_id);
    queue_schema = coalesce(queue_schema, 'ai');
    queue_table = coalesce(queue_table, pg_catalog.concat('_vectorizer_q_', _vectorizer_id));
    _queue_failed_table = pg_catalog.concat('_vectorizer_q_failed_', _vectorizer_id);

    -- make sure queue table name is available
    if pg_catalog.to_regclass(pg_catalog.format('%I.%I', queue_schema, queue_table)) is not null then
        raise exception 'an object named %.% already exists. specify an alternate queue_table explicitly', queue_schema, queue_table
        using errcode = 'duplicate_object';
    end if;

    -- validate the loading config
    perform ai._validate_loading(loading, _source_schema, _source_table);

    -- validate the parsing config
    perform ai._validate_parsing(
        parsing,
        loading,
        _source_schema,
        _source_table
    );

    -- validate the destination config
    perform ai._validate_destination(destination, chunking);

    -- validate the embedding config
    perform ai._validate_embedding(embedding);

    -- validate the chunking config
    perform ai._validate_chunking(chunking);

    -- if ai.indexing_default, resolve the default
    if indexing operator(pg_catalog.->>) 'implementation' = 'default' then
        indexing = ai._resolve_indexing_default();
    end if;

    -- validate the indexing config
    perform ai._validate_indexing(indexing);

    -- validate the formatting config
    perform ai._validate_formatting(formatting, _source_schema, _source_table);

    -- if ai.scheduling_default, resolve the default
    if scheduling operator(pg_catalog.->>) 'implementation' = 'default' then
        scheduling = ai._resolve_scheduling_default();
    end if;

    -- validate the scheduling config
    perform ai._validate_scheduling(scheduling);

    -- validate the processing config
    perform ai._validate_processing(processing);

    -- if scheduling is none then indexing must also be none
    if scheduling operator(pg_catalog.->>) 'implementation' = 'none'
    and indexing operator(pg_catalog.->>) 'implementation' != 'none' then
        raise exception 'automatic indexing is not supported without scheduling. set indexing=>ai.indexing_none() when scheduling=>ai.scheduling_none()';
    end if;

    -- evaluate the destination config
    destination = ai._evaluate_destination(destination, _source_schema, _source_table);

    if name is null then
        if destination operator(pg_catalog.->>) 'implementation' = 'table' then
            name = pg_catalog.format('%s_%s', destination operator(pg_catalog.->>) 'target_schema', destination operator(pg_catalog.->>) 'target_table');
        elseif destination operator(pg_catalog.->>) 'implementation' = 'column' then
            name = pg_catalog.format('%s_%s_%s', _source_schema, _source_table, destination operator(pg_catalog.->>) 'embedding_column');
        end if;
    end if;

    -- validate the name is available
    select id from ai.vectorizer
    where ai.vectorizer.name operator(pg_catalog.=) create_vectorizer.name
    into _existing_vectorizer_id
    ;
    if _existing_vectorizer_id is not null then
        if if_not_exists is false then
            raise exception 'a vectorizer named % already exists.', name
            using errcode = 'duplicate_object';
        end if;
        raise notice 'a vectorizer named % already exists, skipping', name;
        return _existing_vectorizer_id;
    end if;

    -- validate the destination can create objects after the if_not_exists check
    perform ai._validate_destination_can_create_objects(destination);

    -- grant select to source table
    perform ai._vectorizer_grant_to_source
    ( _source_schema
    , _source_table
    , grant_to
    );

    -- create the target table or column
    if destination operator(pg_catalog.->>) 'implementation' = 'table' then
        perform ai._vectorizer_create_destination_table
        ( _source_schema
        , _source_table
        , _source_pk
        , _dimensions
        , destination
        , grant_to
        );
    elseif destination operator(pg_catalog.->>) 'implementation' = 'column' then
        perform ai._vectorizer_create_destination_column
        ( _source_schema
        , _source_table
        , _dimensions
        , destination
        );
    else
        raise exception 'invalid implementation for destination';
    end if;

    -- create queue table
    perform ai._vectorizer_create_queue_table
    ( queue_schema
    , queue_table
    , _source_pk
    , grant_to
    );

    -- create queue failed table
    perform ai._vectorizer_create_queue_failed_table
    ( queue_schema
    , _queue_failed_table
    , _source_pk
    , grant_to
    );

    -- create trigger on source table to populate queue
    perform ai._vectorizer_create_source_trigger
    ( _trigger_name
    , queue_schema
    , queue_table
    , _source_schema
    , _source_table
    , destination operator(pg_catalog.->>) 'target_schema'
    , destination operator(pg_catalog.->>) 'target_table'
    , _source_pk
    );


    -- schedule the async ext job
    select ai._vectorizer_schedule_job
    (_vectorizer_id
    , scheduling
    ) into _job_id
    ;
    if _job_id is not null then
        scheduling = pg_catalog.jsonb_insert(scheduling, array['job_id'], pg_catalog.to_jsonb(_job_id));
    end if;

    insert into ai.vectorizer
    ( id
    , source_schema
    , source_table
    , source_pk
    , trigger_name
    , queue_schema
    , queue_table
    , queue_failed_table
    , config
    , name
    )
    values
    ( _vectorizer_id
    , _source_schema
    , _source_table
    , _source_pk
    , _trigger_name
    , queue_schema
    , queue_table
    , _queue_failed_table
    , pg_catalog.jsonb_build_object
      ( 'version', '0.12.1'
      , 'loading', loading
      , 'parsing', parsing
      , 'embedding', embedding
      , 'chunking', chunking
      , 'indexing', indexing
      , 'formatting', formatting
      , 'scheduling', scheduling
      , 'processing', processing
      , 'destination', destination
      )
    , create_vectorizer.name
    );

    -- grant select on the vectorizer table
    perform ai._vectorizer_grant_to_vectorizer(grant_to);

    -- insert into queue any existing rows from source table
    if enqueue_existing is true then
        select pg_catalog.format
        ( $sql$
        insert into %I.%I (%s)
        select %s
        from %I.%I x
        ;
        $sql$
        , queue_schema, queue_table
        , (
            select pg_catalog.string_agg(pg_catalog.format('%I', x.attname), ', ' order by x.attnum)
            from pg_catalog.jsonb_to_recordset(_source_pk) x(attnum int, attname name)
          )
        , (
            select pg_catalog.string_agg(pg_catalog.format('x.%I', x.attname), ', ' order by x.attnum)
            from pg_catalog.jsonb_to_recordset(_source_pk) x(attnum int, attname name)
          )
        , _source_schema, _source_table
        ) into strict _sql
        ;
        execute _sql;
    end if;
    return _vectorizer_id;
end
$_$;


--
-- Name: destination_column(name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.destination_column(embedding_column name) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'column'
    , 'config_type', 'destination'
    , 'embedding_column', embedding_column
    ))
$$;


--
-- Name: disable_vectorizer_schedule(integer); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.disable_vectorizer_schedule(vectorizer_id integer) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _vec ai.vectorizer%rowtype;
    _schedule pg_catalog.jsonb;
    _job_id pg_catalog.int8;
    _sql pg_catalog.text;
begin
    update ai.vectorizer v
    set disabled = true
    where v.id operator(pg_catalog.=) vectorizer_id
    returning * into strict _vec
    ;

    -- enable the scheduled job if exists
    _schedule = _vec.config operator(pg_catalog.->) 'scheduling';
    if _schedule is not null then
        case _schedule operator(pg_catalog.->>) 'implementation'
            when 'none' then -- ok
            when 'timescaledb' then
                _job_id = (_schedule operator(pg_catalog.->) 'job_id')::pg_catalog.int8;
                select pg_catalog.format
                ( $$select %I.alter_job(job_id, scheduled=>false) from timescaledb_information.jobs where job_id = %L$$
                , n.nspname
                , _job_id
                ) into _sql
                from pg_catalog.pg_extension x
                inner join pg_catalog.pg_namespace n on (x.extnamespace = n.oid)
                where x.extname = 'timescaledb'
                ;
                if _sql is not null then
                    execute _sql;
                end if;
        end case;
    end if;
end;
$_$;


--
-- Name: disable_vectorizer_schedule(text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.disable_vectorizer_schedule(name text) RETURNS void
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
   select ai.disable_vectorizer_schedule(v.id)
   from ai.vectorizer v
   where v.name operator(pg_catalog.=) disable_vectorizer_schedule.name;
$$;


--
-- Name: drop_semantic_catalog(name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.drop_semantic_catalog(catalog_name name) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _catalog_name name = drop_semantic_catalog.catalog_name;
    _catalog_id int4;
    _sql text;
    _tbl text;
begin
    delete from ai.semantic_catalog c
    where c.catalog_name = _catalog_name
    returning c.id into strict _catalog_id
    ;

    -- drop the table for database objects
    _sql = format
    ( $sql$
        drop table if exists ai.semantic_catalog_obj_%s
      $sql$
    , _catalog_id
    );
    raise debug '%', _sql;
    execute _sql;
    
    -- drop the table for example sql
    _sql = format
    ( $sql$
        drop table if exists ai.semantic_catalog_sql_%s
      $sql$
    , _catalog_id
    );
    raise debug '%', _sql;
    execute _sql;
    
    -- drop the table for facts
    _sql = format
    ( $sql$
        drop table if exists ai.semantic_catalog_fact_%s
      $sql$
    , _catalog_id
    );
    raise debug '%', _sql;
    execute _sql;
    
    -- drop trigger functions
    for _tbl in (values ('obj', 'sql', 'fact'))
    loop
        _sql = format
        ( $sql$
            drop function if exists ai.semantic_catalog_%s_%s_trig()
          $sql$
        , _tbl
        , _catalog_id
        );
        raise debug '%', _sql;
        execute _sql;
    end loop;
    
    return _catalog_id;
end
$_$;


--
-- Name: drop_vectorizer(integer, boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.drop_vectorizer(vectorizer_id integer, drop_all boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
/* drop_vectorizer
This function does the following:
1. deletes the scheduled job if any
2. drops the trigger from the source table
3. drops the trigger function
4. drops the queue table
5. deletes the vectorizer row

UNLESS drop_all = true, it does NOT:
1. drop the target table containing the embeddings
2. drop the view joining the target and source
*/
declare
    _vec ai.vectorizer%rowtype;
    _schedule pg_catalog.jsonb;
    _job_id pg_catalog.int8;
    _trigger pg_catalog.pg_trigger%rowtype;
    _sql pg_catalog.text;
begin
    -- grab the vectorizer we need to drop
    select v.* into strict _vec
    from ai.vectorizer v
    where v.id operator(pg_catalog.=) vectorizer_id
    ;

    -- delete the scheduled job if exists
    _schedule = _vec.config operator(pg_catalog.->) 'scheduling';
    if _schedule is not null then
        case _schedule operator(pg_catalog.->>) 'implementation'
            when 'none' then -- ok
            when 'timescaledb' then
                _job_id = (_schedule operator(pg_catalog.->) 'job_id')::pg_catalog.int8;
                select pg_catalog.format
                ( $$select %I.delete_job(job_id) from timescaledb_information.jobs where job_id = %L$$
                , n.nspname
                , _job_id
                ) into _sql
                from pg_catalog.pg_extension x
                inner join pg_catalog.pg_namespace n on (x.extnamespace operator(pg_catalog.=) n.oid)
                where x.extname operator(pg_catalog.=) 'timescaledb'
                ;
                if found then
                    execute _sql;
                end if;
        end case;
    end if;

    -- try to look up the trigger so we can find the function/procedure backing the trigger
    select * into _trigger
    from pg_catalog.pg_trigger g
    inner join pg_catalog.pg_class k
    on (g.tgrelid operator(pg_catalog.=) k.oid
    and k.relname operator(pg_catalog.=) _vec.source_table)
    inner join pg_catalog.pg_namespace n
    on (k.relnamespace operator(pg_catalog.=) n.oid
    and n.nspname operator(pg_catalog.=) _vec.source_schema)
    where g.tgname operator(pg_catalog.=) _vec.trigger_name
    ;

    -- drop the trigger on the source table
    if found then
        select pg_catalog.format
        ( $sql$drop trigger %I on %I.%I$sql$
        , _trigger.tgname
        , _vec.source_schema
        , _vec.source_table
        ) into strict _sql
        ;
        execute _sql;

        select pg_catalog.format
        ( $sql$drop trigger if exists %I on %I.%I$sql$
        , format('%s_truncate', _trigger.tgname)
        , _vec.source_schema
        , _vec.source_table
        ) into _sql;
        execute _sql;

        -- drop the function/procedure backing the trigger
        select pg_catalog.format
        ( $sql$drop %s %I.%I()$sql$
        , case p.prokind when 'f' then 'function' when 'p' then 'procedure' end
        , n.nspname
        , p.proname
        ) into _sql
        from pg_catalog.pg_proc p
        inner join pg_catalog.pg_namespace n on (n.oid operator(pg_catalog.=) p.pronamespace)
        where p.oid operator(pg_catalog.=) _trigger.tgfoid
        ;
        if found then
            execute _sql;
        end if;
    else
        -- the trigger is missing. try to find the backing function by name and return type
        select pg_catalog.format
        ( $sql$drop %s %I.%I() cascade$sql$ -- cascade in case the trigger still exists somehow
        , case p.prokind when 'f' then 'function' when 'p' then 'procedure' end
        , n.nspname
        , p.proname
        ) into _sql
        from pg_catalog.pg_proc p
        inner join pg_catalog.pg_namespace n on (n.oid operator(pg_catalog.=) p.pronamespace)
        inner join pg_catalog.pg_type y on (p.prorettype operator(pg_catalog.=) y.oid)
        where n.nspname operator(pg_catalog.=) _vec.queue_schema
        and p.proname operator(pg_catalog.=) _vec.trigger_name
        and y.typname operator(pg_catalog.=) 'trigger'
        ;
        if found then
            execute _sql;
        end if;
    end if;

    -- drop the queue table if exists
    select pg_catalog.format
    ( $sql$drop table if exists %I.%I$sql$
    , _vec.queue_schema
    , _vec.queue_table
    ) into strict _sql;
    execute _sql;

    -- drop the failed queue table if exists
    select pg_catalog.format
    ( $sql$drop table if exists %I.%I$sql$
    , _vec.queue_schema
    , _vec.queue_failed_table
    ) into strict _sql;
    execute _sql;

    if drop_all and _vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'implementation' operator(pg_catalog.=) 'table' then
        -- drop the view if exists
        select pg_catalog.format
        ( $sql$drop view if exists %I.%I$sql$
        , _vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'view_schema'
        , _vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'view_name'
        ) into strict _sql;
        execute _sql;

        -- drop the target table if exists
        select pg_catalog.format
        ( $sql$drop table if exists %I.%I$sql$
        , _vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'target_schema'
        , _vec.config operator(pg_catalog.->) 'destination' operator(pg_catalog.->>) 'target_table'
        ) into strict _sql;
        execute _sql;
    end if;

    -- delete the vectorizer row
    delete from ai.vectorizer v
    where v.id operator(pg_catalog.=) vectorizer_id
    ;
end;
$_$;


--
-- Name: drop_vectorizer(text, boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.drop_vectorizer(name text, drop_all boolean DEFAULT false) RETURNS void
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
   select ai.drop_vectorizer(v.id, drop_all)
   from ai.vectorizer v
   where v.name operator(pg_catalog.=) drop_vectorizer.name;
$$;


--
-- Name: embedding_litellm(text, integer, text, jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.embedding_litellm(model text, dimensions integer, api_key_name text DEFAULT NULL::text, extra_options jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
begin
    return json_strip_nulls(json_build_object
    ( 'implementation', 'litellm'
    , 'config_type', 'embedding'
    , 'model', model
    , 'dimensions', dimensions
    , 'api_key_name', api_key_name
    , 'extra_options', extra_options
    ));
end
$$;


--
-- Name: embedding_ollama(text, integer, text, jsonb, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.embedding_ollama(model text, dimensions integer, base_url text DEFAULT NULL::text, options jsonb DEFAULT NULL::jsonb, keep_alive text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'ollama'
    , 'config_type', 'embedding'
    , 'model', model
    , 'dimensions', dimensions
    , 'base_url', base_url
    , 'options', options
    , 'keep_alive', keep_alive
    ))
$$;


--
-- Name: embedding_openai(text, integer, text, text, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.embedding_openai(model text, dimensions integer, chat_user text DEFAULT NULL::text, api_key_name text DEFAULT 'OPENAI_API_KEY'::text, base_url text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'openai'
    , 'config_type', 'embedding'
    , 'model', model
    , 'dimensions', dimensions
    , 'user', chat_user
    , 'api_key_name', api_key_name
    , 'base_url', base_url
    ))
$$;


--
-- Name: embedding_voyageai(text, integer, text, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.embedding_voyageai(model text, dimensions integer, input_type text DEFAULT 'document'::text, api_key_name text DEFAULT 'VOYAGE_API_KEY'::text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
begin
    if input_type is not null and input_type not in ('query', 'document') then
        -- Note: purposefully not using an enum here because types make life complicated
        raise exception 'invalid input_type for voyage ai "%"', input_type;
    end if;

    return json_strip_nulls(json_build_object
    ( 'implementation', 'voyageai'
    , 'config_type', 'embedding'
    , 'model', model
    , 'dimensions', dimensions
    , 'input_type', input_type
    , 'api_key_name', api_key_name
    ));
end
$$;


--
-- Name: enable_vectorizer_schedule(integer); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.enable_vectorizer_schedule(vectorizer_id integer) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _vec ai.vectorizer%rowtype;
    _schedule pg_catalog.jsonb;
    _job_id pg_catalog.int8;
    _sql pg_catalog.text;
begin
    update ai.vectorizer v
    set disabled = false
    where v.id operator(pg_catalog.=) vectorizer_id
    returning * into strict _vec
    ;

    -- enable the scheduled job if exists
    _schedule = _vec.config operator(pg_catalog.->) 'scheduling';
    if _schedule is not null then
        case _schedule operator(pg_catalog.->>) 'implementation'
            when 'none' then -- ok
            when 'timescaledb' then
                _job_id = (_schedule operator(pg_catalog.->) 'job_id')::pg_catalog.int8;
                select pg_catalog.format
                ( $$select %I.alter_job(job_id, scheduled=>true) from timescaledb_information.jobs where job_id = %L$$
                , n.nspname
                , _job_id
                ) into _sql
                from pg_catalog.pg_extension x
                inner join pg_catalog.pg_namespace n on (x.extnamespace operator(pg_catalog.=) n.oid)
                where x.extname operator(pg_catalog.=) 'timescaledb'
                ;
                if _sql is not null then
                    execute _sql;
                end if;
        end case;
    end if;
end;
$_$;


--
-- Name: enable_vectorizer_schedule(text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.enable_vectorizer_schedule(name text) RETURNS void
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
   select ai.enable_vectorizer_schedule(v.id)
   from ai.vectorizer v
   where v.name operator(pg_catalog.=) enable_vectorizer_schedule.name;
$$;


--
-- Name: execute_vectorizer(text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.execute_vectorizer(vectorizer_name text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _vectorizer_id pg_catalog.int4;
begin
    select v.id into strict _vectorizer_id
    from ai.vectorizer v
    where v.name operator(pg_catalog.=) vectorizer_name;

    -- execute the vectorizer
    perform ai.execute_vectorizer(_vectorizer_id);
end
$$;


--
-- Name: get_api_key(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.get_api_key() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
      DECLARE
        api_key TEXT;
      BEGIN
        SELECT value INTO api_key
        FROM ai.config
        WHERE key = 'openai_api_key';
        RETURN api_key;
      END;
      $$;


--
-- Name: get_api_key_from_settings(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.get_api_key_from_settings() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
      DECLARE
        api_key TEXT;
      BEGIN
        -- Try API category settings first
        SELECT value INTO api_key
        FROM settings
        WHERE (
          key = 'api.openai.apiKey'
          OR key = 'api.openai.key'
          OR key = 'openai.apiKey'
        )
        AND category = 'api'
        LIMIT 1;

        -- If not found, try ai.config
        IF api_key IS NULL THEN
          SELECT value INTO api_key
          FROM ai.config
          WHERE key = 'openai_api_key';
        END IF;

        RETURN api_key;
      END;
      $$;


--
-- Name: get_embedding_model(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.get_embedding_model() RETURNS text
    LANGUAGE plpgsql
    AS $$
      DECLARE
        model TEXT;
      BEGIN
        SELECT value INTO model
        FROM ai.config
        WHERE key = 'embedding_model';
        RETURN COALESCE(model, 'text-embedding-3-large');
      END;
      $$;


--
-- Name: get_model_dimensions(text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.get_model_dimensions(model_name text) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      BEGIN
        CASE model_name
          WHEN 'text-embedding-3-large' THEN RETURN 3072;
          WHEN 'text-embedding-3-small' THEN RETURN 1536;
          WHEN 'text-embedding-ada-002' THEN RETURN 1536;
          ELSE RETURN 1536;
        END CASE;
      END;
      $$;


--
-- Name: get_model_from_settings(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.get_model_from_settings() RETURNS text
    LANGUAGE plpgsql
    AS $$
      DECLARE
        model TEXT;
      BEGIN
        -- Try API settings first
        SELECT value INTO model
        FROM settings
        WHERE (
          key = 'api.openai.embeddingModel'
          OR key = 'activeEmbeddingModel'
          OR key = 'api.embedding.model'
        )
        LIMIT 1;

        -- Validate it's an embedding model
        IF model IS NOT NULL AND NOT model LIKE '%embedding%' THEN
          model := 'text-embedding-3-large';
        END IF;

        -- If not found, use ai.config
        IF model IS NULL THEN
          SELECT value INTO model
          FROM ai.config
          WHERE key = 'embedding_model';
        END IF;

        RETURN COALESCE(model, 'text-embedding-3-large');
      END;
      $$;


--
-- Name: get_pending_batch(integer); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.get_pending_batch(batch_size integer DEFAULT 10) RETURNS TABLE(queue_id bigint, content text)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      UPDATE ai.embedding_queue
      SET status = 'processing',
          processed_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT id FROM ai.embedding_queue
        WHERE status = 'pending' AND retry_count < 3
        ORDER BY created_at
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, content;
    END;
    $$;


--
-- Name: get_status(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.get_status() RETURNS TABLE(pending_count bigint, processing_count bigint, completed_count bigint, failed_count bigint, cache_size bigint, total_tokens bigint, total_cost numeric)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        (SELECT COUNT(*) FROM ai.embedding_queue WHERE status = 'pending'),
        (SELECT COUNT(*) FROM ai.embedding_queue WHERE status = 'processing'),
        (SELECT COUNT(*) FROM ai.embedding_queue WHERE status = 'completed'),
        (SELECT COUNT(*) FROM ai.embedding_queue WHERE status = 'failed'),
        (SELECT COUNT(*) FROM ai.embedding_cache),
        (SELECT COALESCE(SUM(tokens_used), 0) FROM ai.embedding_queue WHERE status = 'completed'),
        (SELECT COALESCE(SUM(cost_usd), 0) FROM ai.embedding_queue WHERE status = 'completed');
    END;
    $$;


--
-- Name: grant_to(name[]); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.grant_to(VARIADIC grantees name[]) RETURNS name[]
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select coalesce(pg_catalog.array_agg(cast(x as pg_catalog.name)), array[]::pg_catalog.name[])
    from (
        select pg_catalog.unnest(grantees) x
        union
        select trim(pg_catalog.string_to_table(pg_catalog.current_setting('ai.grant_to_default', true), ',')) x
    ) _;
$$;


--
-- Name: grant_vectorizer_usage(name, boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.grant_vectorizer_usage(to_user name, admin boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
begin
    if not admin then
        execute 'grant usage, create on schema ai to ' || to_user;
        execute 'grant select, insert, update, delete on table ai.vectorizer to ' || to_user;
        execute 'grant select on ai._vectorizer_errors to ' || to_user;
        execute 'grant select on ai.vectorizer_errors to ' || to_user;
        execute 'grant select on ai.vectorizer_status to ' || to_user;
        execute 'grant select, usage on sequence ai.vectorizer_id_seq to ' || to_user;
    else
        execute 'grant all privileges on schema ai to ' || to_user;
        execute 'grant all privileges on table ai.pgai_lib_migration to ' || to_user;
        execute 'grant all privileges on table ai.pgai_lib_version to ' || to_user;
        execute 'grant all privileges on table ai.pgai_lib_feature_flag to ' || to_user;
        execute 'grant all privileges on table ai.vectorizer to ' || to_user;
        execute 'grant all privileges on table ai._vectorizer_errors to ' || to_user;
        execute 'grant all privileges on table ai.vectorizer_errors to ' || to_user;
        execute 'grant all privileges on table ai.vectorizer_status to ' || to_user;
        execute 'grant all privileges on sequence ai.vectorizer_id_seq to ' || to_user;
    end if;
end
$$;


--
-- Name: hash_content(text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.hash_content(content text) RETURNS character varying
    LANGUAGE sql IMMUTABLE
    AS $$
      SELECT encode(digest(content, 'sha256'), 'hex');
    $$;


--
-- Name: indexing_diskann(integer, text, integer, integer, double precision, integer, integer, boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.indexing_diskann(min_rows integer DEFAULT 100000, storage_layout text DEFAULT NULL::text, num_neighbors integer DEFAULT NULL::integer, search_list_size integer DEFAULT NULL::integer, max_alpha double precision DEFAULT NULL::double precision, num_dimensions integer DEFAULT NULL::integer, num_bits_per_dimension integer DEFAULT NULL::integer, create_when_queue_empty boolean DEFAULT true) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'diskann'
    , 'config_type', 'indexing'
    , 'min_rows', min_rows
    , 'storage_layout', storage_layout
    , 'num_neighbors', num_neighbors
    , 'search_list_size', search_list_size
    , 'max_alpha', max_alpha
    , 'num_dimensions', num_dimensions
    , 'num_bits_per_dimension', num_bits_per_dimension
    , 'create_when_queue_empty', create_when_queue_empty
    ))
$$;


--
-- Name: indexing_hnsw(integer, text, integer, integer, boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.indexing_hnsw(min_rows integer DEFAULT 100000, opclass text DEFAULT 'vector_cosine_ops'::text, m integer DEFAULT NULL::integer, ef_construction integer DEFAULT NULL::integer, create_when_queue_empty boolean DEFAULT true) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'hnsw'
    , 'config_type', 'indexing'
    , 'min_rows', min_rows
    , 'opclass', opclass
    , 'm', m
    , 'ef_construction', ef_construction
    , 'create_when_queue_empty', create_when_queue_empty
    ))
$$;


--
-- Name: indexing_none(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.indexing_none() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select jsonb_build_object
    ( 'implementation', 'none'
    , 'config_type', 'indexing'
    )
$$;


--
-- Name: loading_column(name, integer); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.loading_column(column_name name, retries integer DEFAULT 6) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_build_object
    ( 'implementation', 'column'
    , 'config_type', 'loading'
    , 'column_name', column_name
    , 'retries', retries
    )
$$;


--
-- Name: loading_uri(name, integer, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.loading_uri(column_name name, retries integer DEFAULT 6, aws_role_arn text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'uri'
    , 'config_type', 'loading'
    , 'column_name', column_name
    , 'retries', retries
    , 'aws_role_arn', aws_role_arn
    ))
$$;


--
-- Name: parsing_docling(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.parsing_docling() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_build_object
    ( 'implementation', 'docling'
    , 'config_type', 'parsing'
    )
$$;


--
-- Name: parsing_none(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.parsing_none() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_build_object
    ( 'implementation', 'none'
    , 'config_type', 'parsing'
    )
$$;


--
-- Name: parsing_pymupdf(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.parsing_pymupdf() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_build_object
    ( 'implementation', 'pymupdf'
    , 'config_type', 'parsing'
    )
$$;


--
-- Name: queue_embedding(character varying, character varying, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.queue_embedding(p_table_name character varying, p_record_id character varying, p_content text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_hash VARCHAR(64);
      v_cached_embedding vector(3072);
    BEGIN
      -- Calculate content hash
      v_hash := ai.hash_content(p_content);

      -- Check cache first
      SELECT embedding INTO v_cached_embedding
      FROM ai.embedding_cache
      WHERE content_hash = v_hash;

      IF v_cached_embedding IS NOT NULL THEN
        -- Use cached embedding
        UPDATE unified_embeddings
        SET embedding = v_cached_embedding,
            updated_at = CURRENT_TIMESTAMP
        WHERE source_table = p_table_name
          AND source_id = p_record_id;

        RETURN TRUE;
      END IF;

      -- Queue for generation
      INSERT INTO ai.embedding_queue (table_name, record_id, content, content_hash)
      VALUES (p_table_name, p_record_id, p_content, v_hash)
      ON CONFLICT (table_name, record_id)
      DO UPDATE SET
        content = EXCLUDED.content,
        content_hash = EXCLUDED.content_hash,
        status = 'pending',
        retry_count = 0;

      RETURN TRUE;
    END;
    $$;


--
-- Name: semantic_catalog_embedding; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.semantic_catalog_embedding (
    id integer NOT NULL,
    semantic_catalog_id integer NOT NULL,
    embedding_name name NOT NULL,
    config jsonb NOT NULL,
    CONSTRAINT semantic_catalog_embedding_config_check CHECK ((jsonb_typeof(config) = 'object'::text)),
    CONSTRAINT semantic_catalog_embedding_embedding_name_check CHECK ((embedding_name ~ '^[a-z][a-z_0-9]*$'::text))
);


--
-- Name: sc_add_embedding(jsonb, name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_add_embedding(config jsonb, embedding_name name DEFAULT NULL::name, catalog_name name DEFAULT 'default'::name) RETURNS ai.semantic_catalog_embedding
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _config jsonb = sc_add_embedding.config;
    _embedding_name name = sc_add_embedding.embedding_name;
    _catalog_name name = sc_add_embedding.catalog_name;
    _catalog_id int4;
    _dims int4;
    _tbl text;
    _sql text;
    _embedding ai.semantic_catalog_embedding;
begin
    -- TODO: validate embedding config

    _dims = (_config->'dimensions')::int4;
    assert _dims is not null, 'embedding config is missing dimensions';
    
    -- grab the catalog id
    select c.id into strict _catalog_id
    from ai.semantic_catalog c
    where c.catalog_name = _catalog_name
    ;
    
    if _embedding_name is null then
        select 'emb' ||
        greatest
        ( count(*)::int4
        , max((regexp_match(e.embedding_name, '[0-9]+$'))[1]::int4)
        ) + 1
        into strict _embedding_name
        from ai.semantic_catalog_embedding e
        where e.semantic_catalog_id = _catalog_id
        ;
    end if;
    
    insert into ai.semantic_catalog_embedding (semantic_catalog_id, embedding_name, config)
    values (_catalog_id, _embedding_name, _config)
    returning * into strict _embedding
    ;
    
    -- add the columns
    foreach _tbl in array array['obj', 'sql', 'fact']
    loop
        _sql = format
        (
        $sql$
            alter table ai.semantic_catalog_%s_%s add column %s public.vector(%s)
        $sql$
        , _tbl
        , _catalog_id
        , _embedding_name
        , _dims
        );
        raise debug '%', _sql;
        execute _sql;
    end loop;
    
    perform ai._semantic_catalog_make_triggers(_catalog_id);
    
    return _embedding;
end;
$_$;


--
-- Name: sc_add_fact(text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_add_fact(description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _catalog_name name = sc_add_fact.catalog_name;
    _sql text;
    _id int8;
begin
    select format
    ( $sql$
        insert into ai.semantic_catalog_fact_%s
        ( description
        )
        values
        ( $1
        )
        returning id
      $sql$
    , x.id
    ) into strict _sql
    from ai.semantic_catalog x
    where x.catalog_name = _catalog_name
    ;
    execute _sql using description
    into strict _id;
    return _id;
end
$_$;


--
-- Name: sc_add_sql_desc(text, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_add_sql_desc(sql text, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _catalog_name name = sc_add_sql_desc.catalog_name;
    _sql text;
    _id int8;
begin
    select format
    ( $sql$
        insert into ai.semantic_catalog_sql_%s
        ( sql
        , description
        )
        values
        ( $1
        , $2
        )
        returning id
      $sql$
    , x.id
    ) into strict _sql
    from ai.semantic_catalog x
    where x.catalog_name = _catalog_name
    ;
    execute _sql using
      sql
    , description
    into strict _id;
    return _id;
end
$_$;


--
-- Name: sc_drop_embedding(name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_drop_embedding(embedding_name name, catalog_name name DEFAULT 'default'::name) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _embedding_name name = sc_drop_embedding.embedding_name;
    _catalog_name name = sc_drop_embedding.catalog_name;
    _embedding ai.semantic_catalog_embedding;
    _catalog_id int4;
    _tbl text;
    _sql text;
begin

    select c.id into strict _catalog_id
    from ai.semantic_catalog c
    where c.catalog_name = _catalog_name
    ;

    delete from ai.semantic_catalog_embedding e
    where e.semantic_catalog_id = _catalog_id
    and e.embedding_name = _embedding_name
    returning * into strict _embedding
    ;
    
    -- drop the columns
    foreach _tbl in array array['obj', 'sql', 'fact']
    loop
        _sql = format
        (
        $sql$
            alter table ai.semantic_catalog_%s_%s drop column %s
        $sql$
        , _tbl
        , _catalog_id
        , _embedding_name
        );
        raise debug '%', _sql;
        execute _sql;
    end loop;
    
    perform ai._semantic_catalog_make_triggers(_catalog_id);
end;
$_$;


--
-- Name: sc_grant_admin(name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_grant_admin(role_name name) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _role_name name = sc_grant_admin.role_name;
    _sql text;
begin

    _sql = format($sql$grant usage on schema ai to %I$sql$, _role_name);
    raise debug '%', _sql;
    execute _sql;

    for _sql in
    (
        select format(x, _role_name)
        from unnest(array[
            $sql$grant select, insert, update, delete, truncate on ai.semantic_catalog to %I$sql$,
            $sql$grant usage, select, update on sequence ai.semantic_catalog_id_seq to %I$sql$,
            $sql$grant select, insert, update, delete, truncate on ai.semantic_catalog_embedding to %I$sql$,
            $sql$grant usage, select, update on sequence ai.semantic_catalog_embedding_id_seq to %I$sql$
        ]) x
    )
    loop
        raise debug '%', _sql;
        execute _sql;
    end loop;

    for _sql in
    (
        select format(y, x.id, _role_name)
        from ai.semantic_catalog x
        cross join unnest(array[
            $sql$grant select, insert, update, delete on ai.semantic_catalog_obj_%s to %I$sql$,
            $sql$grant usage, select, update on sequence ai.semantic_catalog_obj_%s_id_seq to %I$sql$,
            $sql$grant select, insert, update, delete on ai.semantic_catalog_sql_%s to %I$sql$,
            $sql$grant usage, select, update on sequence ai.semantic_catalog_sql_%s_id_seq to %I$sql$,
            $sql$grant select, insert, update, delete on ai.semantic_catalog_fact_%s to %I$sql$,
            $sql$grant usage, select, update on sequence ai.semantic_catalog_fact_%s_id_seq to %I$sql$
        ]) y
    )
    loop
        raise debug '%', _sql;
        execute _sql;
    end loop;
end
$_$;


--
-- Name: sc_grant_obj_read(name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_grant_obj_read(catalog_name name, role_name name) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
/*
    grants select/execute on all database objects referenced in the specified catalog
    grants usage on the schemas to which those objects belong
*/
declare
    _catalog_name name = sc_grant_obj_read.catalog_name;
    _role_name name = sc_grant_obj_read.role_name;
    _catalog_id int;
    _sql text;
begin
    select x.id into strict _catalog_id
    from ai.semantic_catalog x
    where x.catalog_name = _catalog_name
    ;
    
    if not has_table_privilege
        ( _role_name
        , format('ai.semantic_catalog_obj_%s', _catalog_id)
        , 'select'
        ) then
        raise exception 'user must have access to the catalog first';
    end if;

    -- schemas
    for _sql in
    (
        select format
        ( $sql$grant usage on schema %I to %I$sql$
        , x.schema_name
        , _role_name
        )
        from
        (
            select distinct x.objnames[1] as schema_name
            from ai._sc_obj(_catalog_id) x
            where x.objsubid = 0
        ) x
    )
    loop
        raise debug '%', _sql;
        execute _sql;
    end loop;

    -- objects
    for _sql in
    (
        select format
        ( $sql$grant %s on %s %I.%I%s to %I$sql$
        , case when x.objtype in ('aggregate', 'function', 'procedure')
            then 'execute'
            else 'select'
          end
        , case
            when x.objtype in ('function', 'aggregate') then 'function'
            else x.objtype
          end
        , x.objnames[1]
        , x.objnames[2]
        , case when x.objtype in ('aggregate', 'function', 'procedure')
            then format('(%s)', array_to_string(x.objargs, ', '))
            else ''
          end
        , _role_name
        )
        from ai._sc_obj(_catalog_id) x
        where x.objsubid = 0
        order by x.objnames
    )
    loop
        raise debug '%', _sql;
        execute _sql;
    end loop;
end
$_$;


--
-- Name: sc_grant_read(name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_grant_read(catalog_name name, role_name name) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _catalog_name name = sc_grant_read.catalog_name;
    _role_name name = sc_grant_read.role_name;
    _catalog_id int;
    _sql text;
begin
    select x.id into strict _catalog_id
    from ai.semantic_catalog x
    where x.catalog_name = _catalog_name
    ;

    _sql = format($sql$grant usage on schema ai to %I$sql$, _role_name);
    raise debug '%', _sql;
    execute _sql;

    for _sql in
    (
        select format(x, _role_name)
        from unnest(array[
            $sql$grant select on ai.semantic_catalog to %I$sql$,
            $sql$grant select on ai.semantic_catalog_embedding to %I$sql$
        ]) x
    )
    loop
        raise debug '%', _sql;
        execute _sql;
    end loop;

    for _sql in
    (
        select format(y, x.id, _role_name)
        from ai.semantic_catalog x
        cross join unnest(array[
            $sql$grant select on ai.semantic_catalog_obj_%s to %I$sql$,
            $sql$grant select on ai.semantic_catalog_sql_%s to %I$sql$,
            $sql$grant select on ai.semantic_catalog_fact_%s to %I$sql$
        ]) y
        where x.catalog_name = _catalog_name
    )
    loop
        raise debug '%', _sql;
        execute _sql;
    end loop;
end
$_$;


--
-- Name: sc_grant_write(name, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_grant_write(catalog_name name, role_name name) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _catalog_name name = sc_grant_write.catalog_name;
    _role_name name = sc_grant_write.role_name;
    _catalog_id int;
    _sql text;
begin
    select x.id into strict _catalog_id
    from ai.semantic_catalog x
    where x.catalog_name = _catalog_name
    ;

    _sql = format($sql$grant usage on schema ai to %I$sql$, _role_name);
    raise debug '%', _sql;
    execute _sql;

    for _sql in
    (
        select format(x, _role_name)
        from unnest(array[
            $sql$grant select on ai.semantic_catalog to %I$sql$,
            $sql$grant select on ai.semantic_catalog_embedding to %I$sql$
        ]) x
    )
    loop
        raise debug '%', _sql;
        execute _sql;
    end loop;

    for _sql in
    (
        select format(y, x.id, _role_name)
        from ai.semantic_catalog x
        cross join unnest(array[
            $sql$grant select, insert, update, delete on ai.semantic_catalog_obj_%s to %I$sql$,
            $sql$grant usage, select, update on sequence ai.semantic_catalog_obj_%s_id_seq to %I$sql$,
            $sql$grant select, insert, update, delete on ai.semantic_catalog_sql_%s to %I$sql$,
            $sql$grant usage, select, update on sequence ai.semantic_catalog_sql_%s_id_seq to %I$sql$,
            $sql$grant select, insert, update, delete on ai.semantic_catalog_fact_%s to %I$sql$,
            $sql$grant usage, select, update on sequence ai.semantic_catalog_fact_%s_id_seq to %I$sql$
        ]) y
        where x.catalog_name = _catalog_name
    )
    loop
        raise debug '%', _sql;
        execute _sql;
    end loop;
end
$_$;


--
-- Name: sc_set_agg_desc(regprocedure, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_agg_desc(a regprocedure, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.sc_set_obj_desc
    ( 'pg_catalog.pg_proc'::regclass::oid
    , a
    , 0
    , x.type
    , x.object_names
    , x.object_args
    , description
    , catalog_name
    )
    from pg_proc o
    cross join pg_identify_object_as_address
    ( 'pg_catalog.pg_proc'::regclass::oid
    , a
    , 0
    ) x
    where o.oid = a
    and o.prokind = 'a'
    ;
$$;


--
-- Name: sc_set_agg_desc(oid, oid, name, name, text[], text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_agg_desc(classid oid, objid oid, schema_name name, agg_name name, objargs text[], description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select *
    from ai.sc_set_obj_desc
    ( classid
    , objid
    , 0
    , 'aggregate'
    , array[schema_name, agg_name]
    , coalesce(objargs, array[]::text[])
    , description
    , catalog_name
    );
$$;


--
-- Name: sc_set_func_desc(regprocedure, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_func_desc(f regprocedure, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.sc_set_obj_desc
    ( 'pg_catalog.pg_proc'::regclass::oid
    , f
    , 0
    , x.type
    , x.object_names
    , x.object_args
    , description
    , catalog_name
    )
    from pg_proc o
    cross join pg_identify_object_as_address
    ( 'pg_catalog.pg_proc'::regclass::oid
    , f
    , 0
    ) x
    where o.oid = f
    and o.prokind in ('f', 'w')
    ;
$$;


--
-- Name: sc_set_func_desc(oid, oid, name, name, text[], text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_func_desc(classid oid, objid oid, schema_name name, func_name name, objargs text[], description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select *
    from ai.sc_set_obj_desc
    ( classid
    , objid
    , 0
    , 'function'
    , array[schema_name, func_name]
    , coalesce(objargs, array[]::text[])
    , description
    , catalog_name
    );
$$;


--
-- Name: sc_set_obj_desc(text, text[], text[], text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_obj_desc(objtype text, objnames text[], objargs text[], description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _classid oid;
    _objid oid;
    _objsubid integer;
begin
    select
      x.classid
    , x.objid
    , x.subobjid
    into strict
      _classid
    , _objid
    , _objsubid
    from pg_get_object_address(objtype, objnames, objargs) x
    ;
    return ai.sc_set_obj_desc
    ( _classid
    , _objid
    , _objsubid
    , objtype
    , objnames
    , objargs
    , description
    , catalog_name
    );
end
$$;


--
-- Name: sc_set_obj_desc(oid, oid, integer, text, text[], text[], text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_obj_desc(classid oid, objid oid, objsubid integer, objtype text, objnames text[], objargs text[], description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _catalog_name name = sc_set_obj_desc.catalog_name;
    _sql text;
    _id int8;
begin
    select format
    ( $sql$
        merge into ai.semantic_catalog_obj_%s tgt
        using
        (
            select
              $1 as classid
            , $2 as objid
            , $3 as objsubid
            , $4 as objtype
            , $5 as objnames
            , $6 as objargs
            , $7 as description
        ) src
        on (tgt.classid = src.classid and tgt.objid = src.objid and tgt.objsubid = src.objsubid)
        when matched then update set description = src.description
        when not matched by target then
        insert
        ( classid
        , objid
        , objsubid
        , objtype
        , objnames
        , objargs
        , description
        )
        values
        ( src.classid
        , src.objid
        , src.objsubid
        , src.objtype
        , src.objnames
        , src.objargs
        , src.description
        )
        returning id
      $sql$
    , x.id
    ) into strict _sql
    from ai.semantic_catalog x
    where x.catalog_name = _catalog_name
    ;
    execute _sql using
      classid
    , objid
    , objsubid
    , objtype
    , objnames
    , objargs
    , description
    into strict _id;
    return _id;
end
$_$;


--
-- Name: sc_set_proc_desc(regprocedure, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_proc_desc(p regprocedure, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.sc_set_obj_desc
    ( 'pg_catalog.pg_proc'::regclass::oid
    , p
    , 0
    , x.type
    , x.object_names
    , x.object_args
    , description
    , catalog_name
    )
    from pg_proc o
    cross join pg_identify_object_as_address
    ( 'pg_catalog.pg_proc'::regclass::oid
    , p
    , 0
    ) x
    where o.oid = p
    and o.prokind = 'p'
    ;
$$;


--
-- Name: sc_set_proc_desc(oid, oid, name, name, text[], text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_proc_desc(classid oid, objid oid, schema_name name, proc_name name, objargs text[], description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select *
    from ai.sc_set_obj_desc
    ( classid
    , objid
    , 0
    , 'procedure'
    , array[schema_name, proc_name]
    , coalesce(objargs, array[]::text[])
    , description
    , catalog_name
    );
$$;


--
-- Name: sc_set_table_col_desc(regclass, name, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_table_col_desc(t regclass, column_name name, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.sc_set_obj_desc
    ( 'pg_catalog.pg_class'::regclass::oid
    , t
    , a.attnum
    , x.type
    , x.object_names
    , x.object_args
    , description
    , catalog_name
    )
    from pg_class k
    inner join pg_attribute a on (k.oid = a.attrelid)
    cross join lateral pg_identify_object_as_address
    ( 'pg_catalog.pg_class'::regclass::oid
    , t
    , a.attnum
    ) x
    where k.oid = t
    and k.relkind in ('r', 'p', 'f')
    and a.attname = column_name
    ;
$$;


--
-- Name: sc_set_table_col_desc(oid, oid, integer, name, name, name, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_table_col_desc(classid oid, objid oid, objsubid integer, schema_name name, table_name name, column_name name, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select *
    from ai.sc_set_obj_desc
    ( classid
    , objid
    , objsubid
    , 'table column'
    , array[schema_name, table_name, column_name]
    , array[]::text[]
    , description
    , catalog_name
    );
$$;


--
-- Name: sc_set_table_desc(regclass, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_table_desc(t regclass, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.sc_set_obj_desc
    ( 'pg_catalog.pg_class'::regclass::oid
    , t
    , 0
    , x.type
    , x.object_names
    , x.object_args
    , description
    , catalog_name
    )
    from pg_class k
    cross join pg_identify_object_as_address
    ( 'pg_catalog.pg_class'::regclass::oid
    , t
    , 0
    ) x
    where k.oid = t
    and k.relkind in ('r', 'p', 'f')
    ;
$$;


--
-- Name: sc_set_table_desc(oid, oid, name, name, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_table_desc(classid oid, objid oid, schema_name name, table_name name, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select *
    from ai.sc_set_obj_desc
    ( classid
    , objid
    , 0
    , 'table'
    , array[schema_name, table_name]
    , array[]::text[]
    , description
    , catalog_name
    );
$$;


--
-- Name: sc_set_view_col_desc(regclass, name, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_view_col_desc(v regclass, column_name name, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.sc_set_obj_desc
    ( 'pg_catalog.pg_class'::regclass::oid
    , v
    , a.attnum
    , x.type
    , x.object_names
    , x.object_args
    , description
    , catalog_name
    )
    from pg_class k
    inner join pg_attribute a on (k.oid = a.attrelid)
    cross join lateral pg_identify_object_as_address
    ( 'pg_catalog.pg_class'::regclass::oid
    , v
    , a.attnum
    ) x
    where k.oid = v
    and k.relkind in ('v', 'm')
    and a.attname = column_name
    ;
$$;


--
-- Name: sc_set_view_col_desc(oid, oid, integer, name, name, name, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_view_col_desc(classid oid, objid oid, objsubid integer, schema_name name, view_name name, column_name name, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select *
    from ai.sc_set_obj_desc
    ( classid
    , objid
    , objsubid
    , 'view column'
    , array[schema_name, view_name, column_name]
    , array[]::text[]
    , description
    , catalog_name
    );
$$;


--
-- Name: sc_set_view_desc(regclass, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_view_desc(v regclass, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.sc_set_obj_desc
    ( 'pg_catalog.pg_class'::regclass::oid
    , v
    , 0
    , x.type
    , x.object_names
    , x.object_args
    , description
    , catalog_name
    )
    from pg_class k
    cross join pg_identify_object_as_address
    ( 'pg_catalog.pg_class'::regclass::oid
    , v
    , 0
    ) x
    where k.oid = v
    and k.relkind in ('v', 'm')
    ;
$$;


--
-- Name: sc_set_view_desc(oid, oid, name, name, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_set_view_desc(classid oid, objid oid, schema_name name, view_name name, description text, catalog_name name DEFAULT 'default'::name) RETURNS bigint
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select *
    from ai.sc_set_obj_desc
    ( classid
    , objid
    , 0
    , 'view'
    , array[schema_name, view_name]
    , array[]::text[]
    , description
    , catalog_name
    );
$$;


--
-- Name: sc_update_fact(bigint, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_update_fact(id bigint, description text, catalog_name name DEFAULT 'default'::name) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _catalog_name name = sc_update_fact.catalog_name;
    _sql text;
begin
    select format
    ( $sql$
        update ai.semantic_catalog_fact_%s set description = $1
        where id = $2
      $sql$
    , x.id
    ) into strict _sql
    from ai.semantic_catalog x
    where x.catalog_name = _catalog_name
    ;
    execute _sql using description, id;
end
$_$;


--
-- Name: sc_update_sql_desc(bigint, text, text, name); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sc_update_sql_desc(id bigint, sql text, description text, catalog_name name DEFAULT 'default'::name) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _catalog_name name = sc_update_sql_desc.catalog_name;
    _sql text;
begin
    select format
    ( $sql$
        update ai.semantic_catalog_sql_%s set
          sql = $1
        , description = $2
        where id = $3
      $sql$
    , x.id
    ) into strict _sql
    from ai.semantic_catalog x
    where x.catalog_name = _catalog_name
    ;
    execute _sql using
      sql
    , description
    , id
    ;
end
$_$;


--
-- Name: scheduling_none(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.scheduling_none() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select pg_catalog.jsonb_build_object
    ( 'implementation', 'none'
    , 'config_type', 'scheduling'
    )
$$;


--
-- Name: scheduling_timescaledb(interval, timestamp with time zone, boolean, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.scheduling_timescaledb(schedule_interval interval DEFAULT '00:05:00'::interval, initial_start timestamp with time zone DEFAULT NULL::timestamp with time zone, fixed_schedule boolean DEFAULT NULL::boolean, timezone text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select json_strip_nulls(json_build_object
    ( 'implementation', 'timescaledb'
    , 'config_type', 'scheduling'
    , 'schedule_interval', schedule_interval
    , 'initial_start', initial_start
    , 'fixed_schedule', fixed_schedule
    , 'timezone', timezone
    ))
$$;


--
-- Name: set_scheduling(integer, jsonb, jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.set_scheduling(vectorizer_id integer, scheduling jsonb DEFAULT ai.scheduling_default(), indexing jsonb DEFAULT ai.indexing_default()) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
  _job_id pg_catalog.int8;
  _updated_config pg_catalog.jsonb;
begin
    -- if ai.indexing_default, resolve the default
    if indexing operator(pg_catalog.->>) 'implementation' = 'default' then
        indexing = ai._resolve_indexing_default();
    end if;

    -- validate the indexing config
    perform ai._validate_indexing(indexing);

    -- if ai.scheduling_default, resolve the default
    if scheduling operator(pg_catalog.->>) 'implementation' = 'default' then
        scheduling = ai._resolve_scheduling_default();
    end if;

    -- validate the scheduling config
    perform ai._validate_scheduling(scheduling);

    -- if scheduling is none then indexing must also be none
    if scheduling operator(pg_catalog.->>) 'implementation' = 'none'
    and indexing operator(pg_catalog.->>) 'implementation' != 'none' then
        raise exception 'automatic indexing is not supported without scheduling. set indexing=>ai.indexing_none() when scheduling=>ai.scheduling_none()';
    end if;

    -- delete current job if it exists
    PERFORM public.delete_job(job_id::pg_catalog.int4)
    FROM (
        SELECT config #>> '{scheduling,job_id}' as job_id
        FROM ai.vectorizer
        WHERE id = vectorizer_id
    ) c
    WHERE job_id IS NOT NULL;

    -- schedule the async ext job
    select ai._vectorizer_schedule_job
    ( vectorizer_id
    , scheduling
    ) into _job_id
    ;
    if _job_id is not null then
        scheduling = pg_catalog.jsonb_insert(scheduling, array['job_id'], pg_catalog.to_jsonb(_job_id));
    end if;

    UPDATE ai.vectorizer
    SET config = config operator(pg_catalog.||) pg_catalog.jsonb_build_object
    ( 'scheduling'
    , scheduling
    , 'indexing'
    , indexing
    )
    WHERE id = vectorizer_id
    RETURNING config INTO _updated_config;

    RETURN _updated_config;
end
$$;


--
-- Name: sync_api_settings(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sync_api_settings() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        -- Only process API category settings
        IF NEW.category = 'api' OR NEW.key LIKE 'api.%' THEN
          -- Sync API key
          IF NEW.key IN ('api.openai.apiKey', 'api.openai.key') THEN
            UPDATE ai.config
            SET value = NEW.value, updated_at = CURRENT_TIMESTAMP
            WHERE key = 'openai_api_key';
          END IF;

          -- Sync embedding model
          IF NEW.key IN ('api.openai.embeddingModel', 'api.embedding.model') THEN
            IF NEW.value LIKE '%embedding%' THEN
              UPDATE ai.config
              SET value = NEW.value, updated_at = CURRENT_TIMESTAMP
              WHERE key = 'embedding_model';
            END IF;
          END IF;

          -- Sync chat model
          IF NEW.key IN ('api.openai.chatModel', 'api.chat.model') THEN
            UPDATE ai.config
            SET value = NEW.value, updated_at = CURRENT_TIMESTAMP
            WHERE key = 'chat_model';
          END IF;

          -- Sync provider
          IF NEW.key IN ('api.embedding.provider', 'api.provider') THEN
            UPDATE ai.config
            SET value = NEW.value, updated_at = CURRENT_TIMESTAMP
            WHERE key = 'embedding_provider';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$;


--
-- Name: sync_settings(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.sync_settings() RETURNS void
    LANGUAGE plpgsql
    AS $$
      DECLARE
        v_api_key TEXT;
        v_model TEXT;
      BEGIN
        -- Get latest API key
        SELECT value INTO v_api_key
        FROM settings
        WHERE key = 'openai.apiKey'
        LIMIT 1;

        -- Get latest embedding model
        SELECT value INTO v_model
        FROM settings
        WHERE key = 'activeEmbeddingModel'
        LIMIT 1;

        -- Update ai.config if values found
        IF v_api_key IS NOT NULL THEN
          UPDATE ai.config
          SET value = v_api_key, updated_at = CURRENT_TIMESTAMP
          WHERE key = 'openai_api_key';
        END IF;

        IF v_model IS NOT NULL AND v_model LIKE '%embedding%' THEN
          UPDATE ai.config
          SET value = v_model, updated_at = CURRENT_TIMESTAMP
          WHERE key = 'embedding_model';
        END IF;
      END;
      $$;


--
-- Name: update_embedding(bigint, public.vector, integer, numeric); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.update_embedding(p_queue_id bigint, p_embedding public.vector, p_tokens integer DEFAULT NULL::integer, p_cost numeric DEFAULT NULL::numeric) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_record RECORD;
    BEGIN
      -- Get queue record
      SELECT * INTO v_record
      FROM ai.embedding_queue
      WHERE id = p_queue_id;

      IF NOT FOUND THEN
        RETURN FALSE;
      END IF;

      -- Update queue
      UPDATE ai.embedding_queue
      SET status = 'completed',
          embedding = p_embedding,
          tokens_used = p_tokens,
          cost_usd = p_cost
      WHERE id = p_queue_id;

      -- Add to cache
      INSERT INTO ai.embedding_cache (content_hash, embedding, model, tokens_used, cost_usd)
      VALUES (v_record.content_hash, p_embedding, v_record.model, p_tokens, p_cost)
      ON CONFLICT (content_hash) DO NOTHING;

      -- Update original table
      UPDATE unified_embeddings
      SET embedding = p_embedding,
          tokens_used = p_tokens,
          updated_at = CURRENT_TIMESTAMP
      WHERE source_table = v_record.table_name
        AND source_id = v_record.record_id;

      RETURN TRUE;
    END;
    $$;


--
-- Name: vectorizer_embed(integer, text, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.vectorizer_embed(vectorizer_id integer, input_text text, input_type text DEFAULT NULL::text) RETURNS public.vector
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.vectorizer_embed
    ( v.config operator(pg_catalog.->) 'embedding'
    , input_text
    , input_type
    )
    from ai.vectorizer v
    where v.id operator(pg_catalog.=) vectorizer_id
    ;
$$;


--
-- Name: vectorizer_embed(jsonb, text, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.vectorizer_embed(embedding_config jsonb, input_text text, input_type text DEFAULT NULL::text) RETURNS public.vector
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
declare
    _emb public.vector;
begin
    case embedding_config operator(pg_catalog.->>) 'implementation'
        when 'openai' then
            _emb = ai.openai_embed
            ( embedding_config operator(pg_catalog.->>) 'model'
            , input_text
            , api_key_name=>(embedding_config operator(pg_catalog.->>) 'api_key_name')
            , dimensions=>(embedding_config operator(pg_catalog.->>) 'dimensions')::pg_catalog.int4
            , openai_user=>(embedding_config operator(pg_catalog.->>) 'user')
            );
        when 'ollama' then
            _emb = ai.ollama_embed
            ( embedding_config operator(pg_catalog.->>) 'model'
            , input_text
            , host=>(embedding_config operator(pg_catalog.->>) 'base_url')
            , keep_alive=>(embedding_config operator(pg_catalog.->>) 'keep_alive')
            , embedding_options=>(embedding_config operator(pg_catalog.->) 'options')
            );
        when 'voyageai' then
            _emb = ai.voyageai_embed
            ( embedding_config operator(pg_catalog.->>) 'model'
            , input_text
            , input_type=>coalesce(input_type, 'query')
            , api_key_name=>(embedding_config operator(pg_catalog.->>) 'api_key_name')
            );
        else
            raise exception 'unsupported embedding implementation';
    end case;

    return _emb;
end
$$;


--
-- Name: vectorizer_embed(text, text, text); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.vectorizer_embed(name text, input_text text, input_type text DEFAULT NULL::text) RETURNS public.vector
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
    select ai.vectorizer_embed(v.id, input_text, input_type)
    from ai.vectorizer v
    where v.name operator(pg_catalog.=) vectorizer_embed.name
    ;
$$;


--
-- Name: vectorizer_queue_pending(integer, boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.vectorizer_queue_pending(vectorizer_id integer, exact_count boolean DEFAULT false) RETURNS bigint
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
declare
    _queue_schema pg_catalog.name;
    _queue_table pg_catalog.name;
    _sql pg_catalog.text;
    _queue_depth pg_catalog.int8;
begin
    select v.queue_schema, v.queue_table into _queue_schema, _queue_table
    from ai.vectorizer v
    where v.id operator(pg_catalog.=) vectorizer_id
    ;

    if _queue_schema is null or _queue_table is null then
        raise exception 'vectorizer has no queue table';
    end if;

    if exact_count then
        select format
        ( $sql$select count(1) from %I.%I$sql$
        , _queue_schema, _queue_table
        ) into strict _sql
        ;
        execute _sql into strict _queue_depth;
    else
        select format
        ( $sql$select count(*) from (select 1 from %I.%I limit 10001) as subselect$sql$
        , _queue_schema, _queue_table
        ) into strict _sql
        ;
        execute _sql into strict _queue_depth;
        if _queue_depth operator(pg_catalog.=) 10001 then
            _queue_depth = 9223372036854775807; -- max bigint value
        end if;
    end if;

    return _queue_depth;
end;
$_$;


--
-- Name: vectorizer_queue_pending(text, boolean); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.vectorizer_queue_pending(name text, exact_count boolean DEFAULT false) RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
   select ai.vectorizer_queue_pending(v.id, exact_count)
   from ai.vectorizer v
   where v.name operator(pg_catalog.=) vectorizer_queue_pending.name;
$$;


--
-- Name: calculate_embedding_cost(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_embedding_cost(token_count integer, model_name character varying DEFAULT 'text-embedding-3-large'::character varying) RETURNS numeric
    LANGUAGE plpgsql
    AS $_$
DECLARE
    cost_per_token DECIMAL(12, 10);
BEGIN
    -- Pricing as of 2024 (adjust as needed)
    CASE model_name
        WHEN 'text-embedding-3-large' THEN
            cost_per_token := 0.00000013; -- $0.13 per 1M tokens
        WHEN 'text-embedding-3-small' THEN
            cost_per_token := 0.00000002; -- $0.02 per 1M tokens
        WHEN 'text-embedding-ada-002' THEN
            cost_per_token := 0.0000001; -- $0.10 per 1M tokens
        ELSE
            cost_per_token := 0.00000013; -- Default to large model
    END CASE;

    RETURN token_count * cost_per_token;
END;
$_$;


--
-- Name: calculate_job_duration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_job_duration() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
        NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_content_hash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_content_hash() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.content_hash IS NULL AND NEW.content IS NOT NULL THEN
    NEW.content_hash := encode(digest(NEW.content, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_content_hash(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_content_hash(content_text text) RETURNS character varying
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF content_text IS NULL OR content_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN encode(
    digest(
      lower(trim(regexp_replace(content_text, '\\s+', ' ', 'g'))),
      'sha256'
    ),
    'hex'
  );
END;
$$;


--
-- Name: get_template_by_keywords(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_template_by_keywords(content_text text, limit_count integer DEFAULT 1) RETURNS TABLE(template_id character varying, name character varying, match_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        dt.template_id,
        dt.name,
        COUNT(*) as match_count
    FROM document_templates dt,
         UNNEST(dt.focus_keywords) as keyword
    WHERE dt.is_active = true
    AND content_text ILIKE '%' || keyword || '%'
    GROUP BY dt.template_id, dt.name, dt.priority
    ORDER BY dt.priority DESC, match_count DESC
    LIMIT limit_count;
END;
$$;


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category character varying(100),
    focus_keywords text[],
    subcategories jsonb,
    target_fields text[],
    extraction_prompt text,
    folder_patterns text[],
    auto_detect_rules jsonb,
    table_schema jsonb,
    custom_extractors jsonb,
    is_active boolean DEFAULT true,
    is_system boolean DEFAULT false,
    priority integer DEFAULT 100,
    version integer DEFAULT 1,
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE document_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.document_templates IS 'Stores document analysis templates for different document types';


--
-- Name: COLUMN document_templates.template_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_templates.template_id IS 'Unique identifier for the template (e.g., turkish_tax_law)';


--
-- Name: COLUMN document_templates.folder_patterns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_templates.folder_patterns IS 'Glob patterns for automatic template detection based on file path';


--
-- Name: COLUMN document_templates.table_schema; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_templates.table_schema IS 'JSON schema defining tables to create for this template type';


--
-- Name: COLUMN document_templates.is_system; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_templates.is_system IS 'System templates cannot be deleted by users';


--
-- Name: get_template_by_path(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_template_by_path(file_path text) RETURNS public.document_templates
    LANGUAGE plpgsql
    AS $$
DECLARE
    template_record document_templates;
    pattern TEXT;
BEGIN
    -- Check each template's folder patterns
    FOR template_record IN
        SELECT * FROM document_templates
        WHERE is_active = true
        ORDER BY priority DESC, created_at ASC
    LOOP
        IF template_record.folder_patterns IS NOT NULL THEN
            FOREACH pattern IN ARRAY template_record.folder_patterns
            LOOP
                -- Convert glob pattern to SQL LIKE pattern
                IF file_path LIKE REPLACE(REPLACE(pattern, '**', '%'), '*', '%') THEN
                    RETURN template_record;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;


--
-- Name: process_embedding_batch(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_embedding_batch(p_table_name character varying, p_batch_size integer DEFAULT 100) RETURNS TABLE(processed integer, errors integer)
    LANGUAGE plpgsql
    AS $$
      DECLARE
        v_processed INTEGER := 0;
        v_errors INTEGER := 0;
      BEGIN
        -- This function can be enhanced when pgai is available
        -- For now, it returns a placeholder
        RETURN QUERY SELECT v_processed, v_errors;
      END;
      $$;


--
-- Name: search_documents(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_documents(query_embedding public.vector, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 10) RETURNS TABLE(document_id bigint, chunk_index integer, content text, similarity double precision, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        de.document_id,
        de.chunk_index,
        de.content,
        1 - (de.embedding <=> query_embedding) AS similarity,
        de.metadata
    FROM document_embeddings de
    WHERE
        de.embedding IS NOT NULL
        AND 1 - (de.embedding <=> query_embedding) > match_threshold
    ORDER BY de.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;


--
-- Name: search_documents(public.vector, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_documents(query_embedding public.vector, match_count integer DEFAULT 5, filter_metadata jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(id integer, title text, content text, metadata jsonb, similarity double precision, source_table character varying, source_id bigint)
    LANGUAGE plpgsql
    AS $$
        BEGIN
          RETURN QUERY
          SELECT 
            d.id,
            d.title,
            d.content,
            d.metadata,
            1 - (d.embedding <=> query_embedding) as similarity,
            d.source_table,
            d.source_id
          FROM rag_data.documents d
          WHERE 
            CASE 
              WHEN filter_metadata = '{}'::jsonb THEN true
              ELSE d.metadata @> filter_metadata
            END
          ORDER BY d.embedding <=> query_embedding
          LIMIT match_count;
        END;
        $$;


--
-- Name: search_messages(public.vector, double precision, integer, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_messages(query_embedding public.vector, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 10, filter_session_id bigint DEFAULT NULL::bigint) RETURNS TABLE(message_id bigint, session_id bigint, content text, similarity double precision, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        me.message_id,
        me.session_id,
        me.content,
        1 - (me.embedding <=> query_embedding) AS similarity,
        me.metadata
    FROM message_embeddings me
    WHERE
        me.embedding IS NOT NULL
        AND (filter_session_id IS NULL OR me.session_id = filter_session_id)
        AND 1 - (me.embedding <=> query_embedding) > match_threshold
    ORDER BY me.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;


--
-- Name: search_similar_embeddings(public.vector, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_similar_embeddings(query_embedding public.vector, limit_count integer DEFAULT 10, similarity_threshold double precision DEFAULT 0.7) RETURNS TABLE(id bigint, source_table character varying, source_id character varying, content text, similarity double precision, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
      BEGIN
        RETURN QUERY
        SELECT
          e.id,
          e.source_table,
          e.source_id,
          e.content,
          1 - (e.embedding <=> query_embedding) as similarity,
          e.metadata
        FROM unified_embeddings e
        WHERE 1 - (e.embedding <=> query_embedding) > similarity_threshold
        ORDER BY e.embedding <=> query_embedding
        LIMIT limit_count;
      END;
      $$;


--
-- Name: search_unified_embeddings(public.vector, double precision, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_unified_embeddings(query_embedding public.vector, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 10, filter_source_table text DEFAULT NULL::text) RETURNS TABLE(id bigint, source_table character varying, source_type character varying, source_id bigint, source_name text, content text, similarity double precision, metadata jsonb, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        ue.id,
        ue.source_table,
        ue.source_type,
        ue.source_id,
        ue.source_name,
        ue.content,
        1 - (ue.embedding <=> query_embedding) AS similarity,
        ue.metadata,
        ue.created_at
    FROM unified_embeddings ue
    WHERE
        (filter_source_table IS NULL OR ue.source_table = filter_source_table)
        AND ue.embedding IS NOT NULL
        AND 1 - (ue.embedding <=> query_embedding) > match_threshold
    ORDER BY ue.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;


--
-- Name: update_import_jobs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_import_jobs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


--
-- Name: update_lightrag_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_lightrag_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_message_embeddings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_message_embeddings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_scheduled_jobs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_scheduled_jobs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_schema_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_schema_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_scrape_embeddings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_scrape_embeddings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$;


--
-- Name: update_template_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_template_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$;


--
-- Name: _vectorizer_errors; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai._vectorizer_errors (
    id integer NOT NULL,
    message text,
    details jsonb,
    recorded timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: config; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.config (
    key character varying(100) NOT NULL,
    value text,
    description text,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: embedding_cache; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.embedding_cache (
    id bigint NOT NULL,
    content_hash character varying(64),
    model character varying(100),
    tokens_used integer,
    cost_usd numeric(10,6),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: embedding_cache_id_seq; Type: SEQUENCE; Schema: ai; Owner: -
--

CREATE SEQUENCE ai.embedding_cache_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embedding_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: ai; Owner: -
--

ALTER SEQUENCE ai.embedding_cache_id_seq OWNED BY ai.embedding_cache.id;


--
-- Name: embedding_queue; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.embedding_queue (
    id bigint NOT NULL,
    table_name character varying(100),
    record_id character varying(100),
    content text,
    content_hash character varying(64),
    model character varying(100) DEFAULT 'text-embedding-3-large'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    tokens_used integer,
    cost_usd numeric(10,6),
    error_message text,
    retry_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp without time zone
);


--
-- Name: embedding_queue_id_seq; Type: SEQUENCE; Schema: ai; Owner: -
--

CREATE SEQUENCE ai.embedding_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embedding_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: ai; Owner: -
--

ALTER SEQUENCE ai.embedding_queue_id_seq OWNED BY ai.embedding_queue.id;


--
-- Name: pgai_lib_feature_flag; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.pgai_lib_feature_flag (
    name text NOT NULL,
    applied_at_version text NOT NULL,
    applied_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: pgai_lib_migration; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.pgai_lib_migration (
    name text NOT NULL,
    applied_at_version text NOT NULL,
    applied_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    body text NOT NULL
);


--
-- Name: pgai_lib_version; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.pgai_lib_version (
    name text NOT NULL,
    version text NOT NULL,
    installed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: semantic_catalog; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.semantic_catalog (
    id integer NOT NULL,
    catalog_name name NOT NULL,
    obj_table name[] NOT NULL,
    sql_table name[] NOT NULL,
    fact_table name[] NOT NULL,
    CONSTRAINT semantic_catalog_catalog_name_check CHECK ((catalog_name ~ '^[a-z][a-z_0-9]*$'::text)),
    CONSTRAINT semantic_catalog_fact_table_check CHECK ((array_length(fact_table, 1) = 2)),
    CONSTRAINT semantic_catalog_fact_table_check1 CHECK ((array_length(fact_table, 1) = 2)),
    CONSTRAINT semantic_catalog_fact_table_check2 CHECK ((array_length(fact_table, 1) = 2))
);


--
-- Name: semantic_catalog_embedding_id_seq; Type: SEQUENCE; Schema: ai; Owner: -
--

ALTER TABLE ai.semantic_catalog_embedding ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ai.semantic_catalog_embedding_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: semantic_catalog_id_seq; Type: SEQUENCE; Schema: ai; Owner: -
--

ALTER TABLE ai.semantic_catalog ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ai.semantic_catalog_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vectorizer_errors; Type: VIEW; Schema: ai; Owner: -
--

CREATE VIEW ai.vectorizer_errors AS
 SELECT ve.id,
    ve.message,
    ve.details,
    ve.recorded,
    v.name
   FROM (ai._vectorizer_errors ve
     LEFT JOIN ai.vectorizer v ON ((ve.id = v.id)));


--
-- Name: vectorizer_id_seq; Type: SEQUENCE; Schema: ai; Owner: -
--

ALTER TABLE ai.vectorizer ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ai.vectorizer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vectorizer_status; Type: VIEW; Schema: ai; Owner: -
--

CREATE VIEW ai.vectorizer_status AS
 SELECT v.id,
    v.name,
    format('%I.%I'::text, v.source_schema, v.source_table) AS source_table,
        CASE
            WHEN (((v.config -> 'destination'::text) ->> 'implementation'::text) = 'table'::text) THEN format('%I.%I'::text, ((v.config -> 'destination'::text) ->> 'target_schema'::text), ((v.config -> 'destination'::text) ->> 'target_table'::text))
            ELSE NULL::text
        END AS target_table,
        CASE
            WHEN (((v.config -> 'destination'::text) ->> 'implementation'::text) = 'table'::text) THEN format('%I.%I'::text, ((v.config -> 'destination'::text) ->> 'view_schema'::text), ((v.config -> 'destination'::text) ->> 'view_name'::text))
            ELSE NULL::text
        END AS view,
        CASE
            WHEN (((v.config -> 'destination'::text) ->> 'implementation'::text) = 'column'::text) THEN format('%I'::text, ((v.config -> 'destination'::text) ->> 'embedding_column'::text))
            ELSE 'embedding'::text
        END AS embedding_column,
        CASE
            WHEN ((v.queue_table IS NOT NULL) AND has_table_privilege(CURRENT_USER, format('%I.%I'::text, v.queue_schema, v.queue_table), 'select'::text)) THEN ai.vectorizer_queue_pending(v.id)
            ELSE NULL::bigint
        END AS pending_items,
    v.disabled
   FROM ai.vectorizer v;


--
-- Name: vectorizer_worker_process; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.vectorizer_worker_process (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    started timestamp with time zone DEFAULT now() NOT NULL,
    expected_heartbeat_interval interval NOT NULL,
    last_heartbeat timestamp with time zone DEFAULT now() NOT NULL,
    heartbeat_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    last_error_at timestamp with time zone,
    last_error_message text
);


--
-- Name: vectorizer_worker_progress; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.vectorizer_worker_progress (
    vectorizer_id integer NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    last_success_at timestamp with time zone,
    last_success_process_id uuid,
    last_error_at timestamp with time zone,
    last_error_message text,
    last_error_process_id uuid
);


--
-- Name: entities; Type: TABLE; Schema: lightrag; Owner: -
--

CREATE TABLE lightrag.entities (
    id integer NOT NULL,
    name text NOT NULL,
    type character varying(50) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: entities_id_seq; Type: SEQUENCE; Schema: lightrag; Owner: -
--

CREATE SEQUENCE lightrag.entities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entities_id_seq; Type: SEQUENCE OWNED BY; Schema: lightrag; Owner: -
--

ALTER SEQUENCE lightrag.entities_id_seq OWNED BY lightrag.entities.id;


--
-- Name: entity_documents; Type: TABLE; Schema: lightrag; Owner: -
--

CREATE TABLE lightrag.entity_documents (
    entity_id integer NOT NULL,
    document_id integer NOT NULL
);


--
-- Name: relationships; Type: TABLE; Schema: lightrag; Owner: -
--

CREATE TABLE lightrag.relationships (
    id integer NOT NULL,
    source_entity_id integer NOT NULL,
    target_entity_id integer NOT NULL,
    type character varying(50) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: relationships_id_seq; Type: SEQUENCE; Schema: lightrag; Owner: -
--

CREATE SEQUENCE lightrag.relationships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: relationships_id_seq; Type: SEQUENCE OWNED BY; Schema: lightrag; Owner: -
--

ALTER SEQUENCE lightrag.relationships_id_seq OWNED BY lightrag.relationships.id;


--
-- Name: activity_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_history (
    id integer NOT NULL,
    operation_type text NOT NULL,
    source_url text,
    title text,
    status text NOT NULL,
    details jsonb,
    metrics jsonb,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: activity_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_history_id_seq OWNED BY public.activity_history.id;


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id integer NOT NULL,
    operation_type character varying(50) NOT NULL,
    source_url text,
    title text,
    status character varying(20),
    details jsonb,
    metrics jsonb,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_id character varying(255) DEFAULT ''::character varying NOT NULL,
    activity_type character varying(50),
    CONSTRAINT activity_log_activity_type_check CHECK (((activity_type)::text = ANY (ARRAY[('model_change'::character varying)::text, ('chat_start'::character varying)::text, ('chat_message'::character varying)::text, ('settings_change'::character varying)::text])))
);


--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;


--
-- Name: api_test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_test_results (
    id integer NOT NULL,
    provider character varying(50) NOT NULL,
    model character varying(255) NOT NULL,
    api_key_hash character varying(255),
    success boolean NOT NULL,
    message text,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    total_tokens integer DEFAULT 0,
    test_duration_ms integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: api_test_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_test_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_test_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_test_results_id_seq OWNED BY public.api_test_results.id;


--
-- Name: apscheduler_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apscheduler_jobs (
    id character varying(255) NOT NULL,
    next_run_time double precision,
    job_state bytea NOT NULL
);


--
-- Name: chat_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_history (
    id integer NOT NULL,
    session_id character varying(255),
    user_message text,
    assistant_message text,
    context_used text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chat_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_history_id_seq OWNED BY public.chat_history.id;


--
-- Name: chatbot_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_settings (
    id integer NOT NULL,
    setting_key character varying(255) NOT NULL,
    setting_value text,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chatbot_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_settings_id_seq OWNED BY public.chatbot_settings.id;


--
-- Name: chatbot_settings_ren; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_settings_ren (
    id integer NOT NULL,
    setting_key character varying(255) NOT NULL,
    setting_value text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chatbot_settings_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_settings_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_settings_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_settings_id_seq1 OWNED BY public.chatbot_settings_ren.id;


--
-- Name: chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chunks (
    id integer NOT NULL,
    document_id integer,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chunks_id_seq OWNED BY public.chunks.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(255) NOT NULL,
    title character varying(500),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: embedding_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embedding_history (
    id integer NOT NULL,
    operation_id text NOT NULL,
    source_table character varying(100) NOT NULL,
    source_type character varying(50) NOT NULL,
    records_processed integer DEFAULT 0,
    records_success integer DEFAULT 0,
    records_failed integer DEFAULT 0,
    embedding_model character varying(100) NOT NULL,
    batch_size integer DEFAULT 50,
    worker_count integer DEFAULT 1,
    status character varying(20) DEFAULT 'pending'::character varying,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: daily_embedding_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.daily_embedding_stats AS
 SELECT date(embedding_history.created_at) AS date,
    embedding_history.source_table,
    embedding_history.embedding_model,
    sum(embedding_history.records_processed) AS records_processed,
    sum(embedding_history.records_success) AS records_success,
    sum(embedding_history.records_failed) AS records_failed,
    count(*) AS operation_count
   FROM public.embedding_history
  WHERE ((embedding_history.status)::text = 'completed'::text)
  GROUP BY (date(embedding_history.created_at)), embedding_history.source_table, embedding_history.embedding_model
  ORDER BY (date(embedding_history.created_at)) DESC, embedding_history.source_table, embedding_history.embedding_model;


--
-- Name: document_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_embeddings (
    id integer NOT NULL,
    document_id integer,
    chunk_text text NOT NULL,
    embedding public.vector(1536),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    model_name character varying(100),
    tokens_used integer,
    content_type character varying(50),
    embedding_dimension integer DEFAULT 1536
);


--
-- Name: document_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_embeddings_id_seq OWNED BY public.document_embeddings.id;


--
-- Name: document_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_history (
    id integer NOT NULL,
    filename text NOT NULL,
    file_size integer,
    file_type text,
    content text,
    chunks_count integer DEFAULT 0,
    embeddings_created boolean DEFAULT false,
    success boolean DEFAULT true,
    error_message text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: document_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_history_id_seq OWNED BY public.document_history.id;


--
-- Name: document_processing_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_processing_history (
    id integer NOT NULL,
    migration_id uuid,
    document_type character varying(50),
    document_name character varying(500),
    document_url text,
    file_size_bytes bigint,
    content_length integer,
    chunks_created integer DEFAULT 0,
    embedding_dimensions integer DEFAULT 1536,
    processing_time_ms integer,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: document_processing_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_processing_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_processing_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_processing_history_id_seq OWNED BY public.document_processing_history.id;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    title text NOT NULL,
    content text,
    type character varying(50),
    size integer,
    file_path text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    model_used character varying(100),
    tokens_used integer DEFAULT 0,
    cost_usd numeric(10,6) DEFAULT 0.000000,
    verified_at timestamp without time zone,
    auto_verified boolean DEFAULT false,
    parsed_data jsonb,
    column_headers text[],
    row_count integer,
    transform_status character varying(50) DEFAULT 'pending'::character varying,
    transform_progress integer DEFAULT 0,
    target_table_name character varying(255),
    source_db_id character varying(100),
    transform_errors jsonb,
    transformed_at timestamp without time zone,
    data_quality_score double precision,
    file_type character varying(50),
    file_size integer,
    chunk_count integer DEFAULT 0,
    embedding_count integer DEFAULT 0,
    filename character varying(255),
    original_filename text,
    last_transform_row_count integer,
    column_count integer,
    upload_count integer DEFAULT 1,
    processing_status character varying(50) DEFAULT 'waiting'::character varying
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: embedding_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embedding_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embedding_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embedding_history_id_seq OWNED BY public.embedding_history.id;


--
-- Name: embedding_model_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embedding_model_usage (
    id integer NOT NULL,
    model_name character varying(100) NOT NULL,
    total_tokens_used bigint DEFAULT 0,
    total_embeddings integer DEFAULT 0,
    avg_tokens_per_embedding numeric(10,2) DEFAULT 0,
    last_used_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: embedding_model_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embedding_model_usage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embedding_model_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embedding_model_usage_id_seq OWNED BY public.embedding_model_usage.id;


--
-- Name: embedding_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embedding_progress (
    id integer NOT NULL,
    document_id text,
    document_type text,
    status text DEFAULT 'pending'::text,
    progress integer DEFAULT 0,
    total_chunks integer DEFAULT 0,
    processed_chunks integer DEFAULT 0,
    error_message text,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone
);


--
-- Name: embedding_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embedding_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embedding_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embedding_progress_id_seq OWNED BY public.embedding_progress.id;


--
-- Name: embedding_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embedding_queue (
    id integer NOT NULL,
    table_name character varying(255) NOT NULL,
    record_id integer NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    retry_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp without time zone
);


--
-- Name: embedding_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embedding_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embedding_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embedding_queue_id_seq OWNED BY public.embedding_queue.id;


--
-- Name: unified_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unified_embeddings (
    id integer NOT NULL,
    source_table character varying(100) NOT NULL,
    source_type character varying(50) NOT NULL,
    source_id integer NOT NULL,
    source_name character varying(255) NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    tokens_used integer DEFAULT 0,
    model_used character varying(100) DEFAULT 'text-embedding-ada-002'::character varying,
    content_hash character varying(64),
    embedding public.vector(1536),
    summary text,
    processed_at timestamp without time zone,
    embedding_provider character varying(50) DEFAULT 'openai'::character varying
);


--
-- Name: TABLE unified_embeddings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.unified_embeddings IS 'Unified storage for all document embeddings across different source tables';


--
-- Name: COLUMN unified_embeddings.source_table; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_embeddings.source_table IS 'The name of the source table (e.g., sorucevap, makaleler)';


--
-- Name: COLUMN unified_embeddings.source_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_embeddings.source_type IS 'Type of the source (document, scraped_page, etc.)';


--
-- Name: COLUMN unified_embeddings.source_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_embeddings.source_id IS 'The ID of the record in the source table';


--
-- Name: COLUMN unified_embeddings.source_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_embeddings.source_name IS 'Human-readable name of the source';


--
-- Name: COLUMN unified_embeddings.content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_embeddings.content IS 'The text content that was embedded';


--
-- Name: COLUMN unified_embeddings.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.unified_embeddings.metadata IS 'Additional metadata including tokens, model info, etc.';


--
-- Name: embedding_statistics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.embedding_statistics AS
 SELECT unified_embeddings.source_table,
    unified_embeddings.source_type,
    count(*) AS total_embeddings,
    sum(unified_embeddings.tokens_used) AS total_tokens,
    avg(unified_embeddings.tokens_used) AS avg_tokens_per_embedding,
    count(DISTINCT unified_embeddings.model_used) AS models_used,
    min(unified_embeddings.created_at) AS first_embedding,
    max(unified_embeddings.created_at) AS last_embedding
   FROM public.unified_embeddings
  GROUP BY unified_embeddings.source_table, unified_embeddings.source_type;


--
-- Name: embedding_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embedding_stats (
    id integer NOT NULL,
    table_name character varying(255) NOT NULL,
    total_records integer DEFAULT 0,
    embedded_records integer DEFAULT 0,
    pending_records integer DEFAULT 0,
    failed_records integer DEFAULT 0,
    total_tokens_used integer DEFAULT 0,
    estimated_cost numeric(10,6) DEFAULT 0,
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: embedding_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embedding_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embedding_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embedding_stats_id_seq OWNED BY public.embedding_stats.id;


--
-- Name: embedding_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embedding_tokens (
    id bigint NOT NULL,
    table_name character varying(100) NOT NULL,
    record_id bigint NOT NULL,
    operation_type character varying(50) DEFAULT 'embedding'::character varying,
    tokens_used integer DEFAULT 0,
    model_used character varying(100) DEFAULT 'text-embedding-3-large'::character varying,
    cost_usd numeric(10,6) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: embedding_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embedding_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embedding_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embedding_tokens_id_seq OWNED BY public.embedding_tokens.id;


--
-- Name: embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embeddings (
    id integer NOT NULL,
    source_type character varying(50) NOT NULL,
    source_id integer,
    content text NOT NULL,
    embedding public.vector(1536),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embeddings_id_seq OWNED BY public.embeddings.id;


--
-- Name: import_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_jobs (
    id integer NOT NULL,
    user_id uuid,
    job_type character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    progress integer DEFAULT 0,
    total_files integer DEFAULT 0,
    processed_files integer DEFAULT 0,
    successful_files integer DEFAULT 0,
    failed_files integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_progress CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT valid_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE import_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.import_jobs IS 'Tracks background import jobs with progress and status for large file imports';


--
-- Name: import_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.import_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.import_jobs_id_seq OWNED BY public.import_jobs.id;


--
-- Name: industry_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.industry_presets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    industry_code character varying(50) NOT NULL,
    industry_name character varying(100) NOT NULL,
    industry_icon character varying(50),
    schema_name character varying(100) NOT NULL,
    schema_display_name character varying(200) NOT NULL,
    schema_description text,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    templates jsonb DEFAULT '{}'::jsonb NOT NULL,
    llm_guide text,
    tier character varying(20) DEFAULT 'free'::character varying,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    llm_config jsonb DEFAULT '{}'::jsonb
);


--
-- Name: TABLE industry_presets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.industry_presets IS 'System-provided industry-specific schema templates with LLM config for Vergilex, EmlakAI, and Bookie instances';


--
-- Name: COLUMN industry_presets.llm_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.industry_presets.llm_config IS 'LLM configuration for industry preset. Same structure as user_schemas.llm_config';


--
-- Name: job_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_execution_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    trigger_type character varying(20) DEFAULT 'scheduled'::character varying,
    triggered_by uuid,
    result jsonb,
    error_message text,
    error_stack text,
    error_code character varying(50),
    retry_count integer DEFAULT 0,
    logs text,
    logs_truncated boolean DEFAULT false,
    memory_usage_mb integer,
    cpu_time_ms integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE job_execution_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.job_execution_logs IS 'Tracks individual job executions with results and logs';


--
-- Name: message_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_embeddings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    message_id uuid,
    session_id character varying(255),
    embedding public.vector(1536),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role character varying(50) NOT NULL,
    content text NOT NULL,
    sources jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb DEFAULT '{}'::jsonb,
    model character varying(255),
    prompt_tokens integer DEFAULT 0,
    completion_tokens integer DEFAULT 0,
    total_tokens integer DEFAULT 0,
    cost_usd numeric(10,6) DEFAULT 0,
    CONSTRAINT messages_role_check CHECK (((role)::text = ANY (ARRAY[('user'::character varying)::text, ('assistant'::character varying)::text, ('system'::character varying)::text])))
);


--
-- Name: migration_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_history (
    id integer NOT NULL,
    migration_id uuid DEFAULT gen_random_uuid(),
    source_type character varying(50) NOT NULL,
    source_name character varying(255) NOT NULL,
    database_name character varying(100),
    table_name character varying(100),
    total_records integer NOT NULL,
    processed_records integer DEFAULT 0,
    successful_records integer DEFAULT 0,
    failed_records integer DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying,
    batch_size integer,
    model_used character varying(100) DEFAULT 'text-embedding-ada-002'::character varying,
    tokens_used integer DEFAULT 0,
    estimated_cost numeric(10,6) DEFAULT 0,
    error_message text,
    metadata jsonb,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone,
    duration_seconds integer,
    created_by character varying(100) DEFAULT 'system'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: migration_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migration_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migration_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migration_history_id_seq OWNED BY public.migration_history.id;


--
-- Name: migration_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_jobs (
    id integer NOT NULL,
    job_name character varying(255) NOT NULL,
    source_table character varying(255) NOT NULL,
    target_table character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    total_rows integer DEFAULT 0,
    processed_rows integer DEFAULT 0,
    failed_rows integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: migration_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migration_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migration_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migration_jobs_id_seq OWNED BY public.migration_jobs.id;


--
-- Name: migration_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_progress (
    id bigint NOT NULL,
    migration_name character varying(200) NOT NULL,
    source_table character varying(100) NOT NULL,
    target_table character varying(100) NOT NULL,
    total_records integer DEFAULT 0,
    processed_records integer DEFAULT 0,
    successful_records integer DEFAULT 0,
    failed_records integer DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    last_processed_id bigint,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: migration_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migration_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migration_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migration_progress_id_seq OWNED BY public.migration_progress.id;


--
-- Name: migration_statistics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.migration_statistics AS
 SELECT date(migration_history.started_at) AS migration_date,
    migration_history.source_type,
    count(*) AS total_migrations,
    sum(migration_history.total_records) AS total_records_processed,
    sum(migration_history.successful_records) AS total_successful,
    sum(migration_history.failed_records) AS total_failed,
    sum(migration_history.tokens_used) AS total_tokens_used,
    sum(migration_history.estimated_cost) AS total_cost,
    avg(migration_history.duration_seconds) AS avg_duration_seconds,
    count(
        CASE
            WHEN ((migration_history.status)::text = 'completed'::text) THEN 1
            ELSE NULL::integer
        END) AS completed_migrations,
    count(
        CASE
            WHEN ((migration_history.status)::text = 'failed'::text) THEN 1
            ELSE NULL::integer
        END) AS failed_migrations
   FROM public.migration_history
  GROUP BY (date(migration_history.started_at)), migration_history.source_type
  ORDER BY (date(migration_history.started_at)) DESC;


--
-- Name: migration_status_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.migration_status_summary AS
 SELECT migration_progress.migration_name,
    migration_progress.source_table,
    migration_progress.target_table,
    migration_progress.status,
    migration_progress.total_records,
    migration_progress.processed_records,
    migration_progress.successful_records,
    migration_progress.failed_records,
    migration_progress.error_message,
        CASE
            WHEN (migration_progress.total_records > 0) THEN round((((migration_progress.processed_records)::numeric / (migration_progress.total_records)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS progress_percentage,
    migration_progress.started_at,
    migration_progress.completed_at,
        CASE
            WHEN ((migration_progress.completed_at IS NOT NULL) AND (migration_progress.started_at IS NOT NULL)) THEN EXTRACT(epoch FROM (migration_progress.completed_at - migration_progress.started_at))
            ELSE NULL::numeric
        END AS duration_seconds,
    migration_progress.created_at
   FROM public.migration_progress;


--
-- Name: project_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    site_id uuid,
    scraping_config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: recent_migration_activity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.recent_migration_activity AS
 SELECT migration_history.migration_id,
    migration_history.source_type,
    migration_history.source_name,
    migration_history.table_name,
    migration_history.status,
    round((((migration_history.processed_records)::numeric / (NULLIF(migration_history.total_records, 0))::numeric) * (100)::numeric), 2) AS progress_percentage,
    migration_history.total_records,
    migration_history.processed_records,
    migration_history.tokens_used,
    migration_history.estimated_cost,
    migration_history.started_at,
    migration_history.completed_at,
        CASE
            WHEN ((migration_history.status)::text = 'processing'::text) THEN (EXTRACT(epoch FROM (now() - (migration_history.started_at)::timestamp with time zone)))::integer
            ELSE migration_history.duration_seconds
        END AS duration_seconds
   FROM public.migration_history
  ORDER BY migration_history.started_at DESC
 LIMIT 100;


--
-- Name: scheduled_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    job_type character varying(50) NOT NULL,
    schedule_type character varying(20) DEFAULT 'cron'::character varying NOT NULL,
    cron_expression character varying(100),
    interval_seconds integer,
    run_date timestamp with time zone,
    timezone character varying(50) DEFAULT 'Europe/Istanbul'::character varying,
    job_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true,
    paused_at timestamp with time zone,
    paused_reason text,
    apscheduler_job_id character varying(255),
    last_run_at timestamp with time zone,
    last_run_duration_ms integer,
    last_run_status character varying(20),
    next_run_at timestamp with time zone,
    total_runs integer DEFAULT 0,
    successful_runs integer DEFAULT 0,
    failed_runs integer DEFAULT 0,
    consecutive_failures integer DEFAULT 0,
    last_error text,
    max_retries integer DEFAULT 3,
    retry_delay_seconds integer DEFAULT 60,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT schedule_config_required CHECK (((((schedule_type)::text = 'cron'::text) AND (cron_expression IS NOT NULL)) OR (((schedule_type)::text = 'interval'::text) AND (interval_seconds IS NOT NULL)) OR (((schedule_type)::text = 'date'::text) AND (run_date IS NOT NULL)))),
    CONSTRAINT valid_interval CHECK (((interval_seconds IS NULL) OR (interval_seconds >= 60))),
    CONSTRAINT valid_job_type CHECK (((job_type)::text = ANY ((ARRAY['rag_query'::character varying, 'crawler'::character varying, 'embedding_sync'::character varying, 'cleanup'::character varying, 'custom_script'::character varying])::text[]))),
    CONSTRAINT valid_schedule_type CHECK (((schedule_type)::text = ANY ((ARRAY['cron'::character varying, 'interval'::character varying, 'date'::character varying])::text[])))
);


--
-- Name: TABLE scheduled_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.scheduled_jobs IS 'Stores scheduled job definitions with APScheduler integration';


--
-- Name: scrape_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scrape_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_content text NOT NULL,
    processed_content text,
    summary text,
    embedding public.vector(1536),
    source_url text NOT NULL,
    source_type character varying(50) DEFAULT 'scrape'::character varying,
    project_id uuid NOT NULL,
    site_id uuid,
    scrape_session_id uuid,
    title text,
    author text,
    publish_date timestamp without time zone,
    content_type character varying(50) DEFAULT 'general'::character varying,
    language character varying(10) DEFAULT 'tr'::character varying,
    entities jsonb DEFAULT '[]'::jsonb,
    entity_types text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    processing_status character varying(20) DEFAULT 'pending'::character varying,
    processing_errors text[],
    llm_processed boolean DEFAULT false,
    chunk_index integer DEFAULT 0,
    total_chunks integer DEFAULT 1,
    parent_id uuid,
    relevance_score double precision,
    quality_score double precision,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp without time zone
);


--
-- Name: scrape_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scrape_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    type character varying(50) NOT NULL,
    concept text,
    category_url text,
    status character varying(20) DEFAULT 'pending'::character varying,
    progress integer DEFAULT 0,
    current_step text,
    results jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
-- Name: scrape_statistics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scrape_statistics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    date date DEFAULT CURRENT_DATE,
    total_urls integer DEFAULT 0,
    total_chunks integer DEFAULT 0,
    total_embeddings integer DEFAULT 0,
    categories_processed text[] DEFAULT '{}'::text[],
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: scraped_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scraped_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    site_id uuid,
    url text NOT NULL,
    title text,
    content text,
    category text,
    metadata jsonb DEFAULT '{}'::jsonb,
    processed boolean DEFAULT false,
    embedding_generated boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: scraped_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scraped_data (
    id integer NOT NULL,
    url text NOT NULL,
    title text,
    content text,
    description text,
    keywords text,
    metadata jsonb,
    content_chunks text[],
    embeddings public.vector(1536)[],
    chunk_count integer DEFAULT 0,
    scraping_mode text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    content_length integer DEFAULT 0,
    token_count integer DEFAULT 0
);


--
-- Name: scraped_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scraped_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scraped_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scraped_data_id_seq OWNED BY public.scraped_data.id;


--
-- Name: scraped_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scraped_pages (
    id integer NOT NULL,
    url text NOT NULL,
    title text,
    content text,
    description text,
    keywords text,
    content_length integer,
    chunk_count integer DEFAULT 0,
    token_count integer DEFAULT 0,
    scraping_mode character varying(50),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: scraped_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scraped_pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scraped_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scraped_pages_id_seq OWNED BY public.scraped_pages.id;


--
-- Name: scraper_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scraper_history (
    id integer NOT NULL,
    url text NOT NULL,
    title text,
    content text,
    chunks_count integer DEFAULT 0,
    embeddings_created boolean DEFAULT false,
    success boolean DEFAULT true,
    error_message text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: scraper_history_detailed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scraper_history_detailed (
    id integer NOT NULL,
    migration_id uuid,
    url text NOT NULL,
    domain character varying(255),
    page_title text,
    content_type character varying(100),
    content_length integer,
    chunks_created integer DEFAULT 0,
    links_found integer DEFAULT 0,
    images_found integer DEFAULT 0,
    scrape_depth integer DEFAULT 0,
    response_time_ms integer,
    status_code integer,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    metadata jsonb,
    scraped_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: scraper_history_detailed_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scraper_history_detailed_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scraper_history_detailed_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scraper_history_detailed_id_seq OWNED BY public.scraper_history_detailed.id;


--
-- Name: scraper_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scraper_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scraper_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scraper_history_id_seq OWNED BY public.scraper_history.id;


--
-- Name: scraping_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scraping_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    auto_process boolean DEFAULT true,
    auto_embeddings boolean DEFAULT true,
    real_time boolean DEFAULT true,
    status text DEFAULT 'active'::text,
    stats jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id integer NOT NULL,
    key character varying(255) NOT NULL,
    value text,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    category character varying(50) DEFAULT 'general'::character varying
);


--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: site_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_configurations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    base_url text NOT NULL,
    type text NOT NULL,
    category text,
    selectors jsonb DEFAULT '{}'::jsonb,
    auth_config jsonb DEFAULT '{}'::jsonb,
    rate_limit integer DEFAULT 10,
    pagination_config jsonb DEFAULT '{}'::jsonb,
    filters jsonb DEFAULT '{}'::jsonb,
    transforms jsonb DEFAULT '{}'::jsonb,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    base_url text NOT NULL,
    category character varying(100),
    type character varying(50) DEFAULT 'website'::character varying,
    is_active boolean DEFAULT true,
    scraping_config jsonb,
    structure jsonb,
    entity_types jsonb,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: skipped_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skipped_embeddings (
    id integer NOT NULL,
    source_table character varying(255) NOT NULL,
    source_type character varying(100) NOT NULL,
    source_id character varying(255) NOT NULL,
    source_name text,
    content text,
    skip_reason text NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE skipped_embeddings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.skipped_embeddings IS 'Stores records that cannot be embedded due to missing/invalid content';


--
-- Name: COLUMN skipped_embeddings.skip_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skipped_embeddings.skip_reason IS 'Reason why the record was skipped (e.g., "no_content", "empty_embedding", "invalid_format")';


--
-- Name: skipped_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.skipped_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: skipped_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.skipped_embeddings_id_seq OWNED BY public.skipped_embeddings.id;


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    price numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    duration_days integer NOT NULL,
    features jsonb DEFAULT '{}'::jsonb,
    max_queries_per_month integer,
    max_documents integer,
    max_tokens_per_month integer,
    priority_support boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: template_field_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_field_mappings (
    id integer NOT NULL,
    template_id text NOT NULL,
    source_field text NOT NULL,
    target_table text NOT NULL,
    target_column text NOT NULL,
    transform_function text,
    default_value text,
    is_required boolean DEFAULT false,
    priority integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: template_field_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.template_field_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: template_field_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.template_field_mappings_id_seq OWNED BY public.template_field_mappings.id;


--
-- Name: template_table_schemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_table_schemas (
    id integer NOT NULL,
    template_id text NOT NULL,
    table_name text NOT NULL,
    schema_definition jsonb NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: template_table_schemas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.template_table_schemas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: template_table_schemas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.template_table_schemas_id_seq OWNED BY public.template_table_schemas.id;


--
-- Name: template_transform_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_transform_rules (
    id integer NOT NULL,
    template_id text NOT NULL,
    rule_name text NOT NULL,
    rule_type text NOT NULL,
    rule_definition jsonb NOT NULL,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: template_transform_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.template_transform_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: template_transform_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.template_transform_rules_id_seq OWNED BY public.template_transform_rules.id;


--
-- Name: token_cost_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.token_cost_summary AS
 SELECT embedding_tokens.table_name,
    embedding_tokens.model_used,
    count(*) AS operation_count,
    sum(embedding_tokens.tokens_used) AS total_tokens,
    sum(embedding_tokens.cost_usd) AS total_cost_usd,
    date_trunc('day'::text, embedding_tokens.created_at) AS date
   FROM public.embedding_tokens
  GROUP BY embedding_tokens.table_name, embedding_tokens.model_used, (date_trunc('day'::text, embedding_tokens.created_at))
  ORDER BY (date_trunc('day'::text, embedding_tokens.created_at)) DESC, (sum(embedding_tokens.cost_usd)) DESC;


--
-- Name: transform_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transform_jobs (
    id integer NOT NULL,
    job_id text NOT NULL,
    template_id text NOT NULL,
    folder_config jsonb,
    status text DEFAULT 'pending'::text,
    total_documents integer DEFAULT 0,
    processed_documents integer DEFAULT 0,
    created_tables text[],
    errors jsonb,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: transform_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transform_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transform_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transform_jobs_id_seq OWNED BY public.transform_jobs.id;


--
-- Name: unified_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unified_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unified_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unified_embeddings_id_seq OWNED BY public.unified_embeddings.id;


--
-- Name: user_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_schemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_schemas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    name character varying(100) NOT NULL,
    display_name character varying(200) NOT NULL,
    description text,
    source_type character varying(20) DEFAULT 'custom'::character varying,
    source_preset_id uuid,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    templates jsonb DEFAULT '{}'::jsonb NOT NULL,
    llm_guide text,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    llm_config jsonb DEFAULT '{}'::jsonb
);


--
-- Name: TABLE user_schemas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_schemas IS 'User-created or cloned custom schemas';


--
-- Name: COLUMN user_schemas.llm_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_schemas.llm_config IS 'LLM configuration for various processes. Structure:
{
  "analyzePrompt": "...",       -- Document analysis prompt
  "citationTemplate": "...",    -- Citation formatting template
  "chatbotContext": "...",      -- Chatbot system context
  "embeddingPrefix": "...",     -- Embedding generation prefix
  "transformRules": "...",      -- Transform process rules
  "questionGenerator": "...",   -- Follow-up question generation
  "searchContext": "..."        -- Semantic search context
}';


--
-- Name: user_available_schemas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_available_schemas AS
 SELECT ip.id,
    ip.industry_code,
    ip.industry_name,
    ip.industry_icon,
    ip.schema_name AS name,
    ip.schema_display_name AS display_name,
    ip.schema_description AS description,
    ip.fields,
    ip.templates,
    ip.llm_guide,
    ip.llm_config,
    ip.tier,
    'preset'::text AS schema_type,
    true AS is_system,
    NULL::uuid AS user_id,
    NULL::uuid AS source_preset_id,
    ip.is_active,
    false AS is_default,
    ip.created_at,
    ip.updated_at
   FROM public.industry_presets ip
  WHERE (ip.is_active = true)
UNION ALL
 SELECT us.id,
    COALESCE(ip.industry_code, 'custom'::character varying) AS industry_code,
    COALESCE(ip.industry_name, 'Özel'::character varying) AS industry_name,
    COALESCE(ip.industry_icon, '📝'::character varying) AS industry_icon,
    us.name,
    us.display_name,
    us.description,
    us.fields,
    us.templates,
    us.llm_guide,
    us.llm_config,
    'custom'::character varying AS tier,
    'custom'::text AS schema_type,
    false AS is_system,
    us.user_id,
    us.source_preset_id,
    us.is_active,
    us.is_default,
    us.created_at,
    us.updated_at
   FROM (public.user_schemas us
     LEFT JOIN public.industry_presets ip ON ((us.source_preset_id = ip.id)))
  WHERE (us.is_active = true);


--
-- Name: VIEW user_available_schemas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.user_available_schemas IS 'Combined view of all available schemas (presets + user schemas) with LLM config';


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    user_id uuid NOT NULL,
    avatar_url text,
    company_name character varying(255),
    phone character varying(50),
    address text,
    bio text,
    preferences jsonb DEFAULT '{}'::jsonb,
    chat_history_enabled boolean DEFAULT true,
    usage_stats jsonb DEFAULT '{"total_tokens": 0, "total_queries": 0, "total_documents": 0}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_question_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_question_pool (
    id integer NOT NULL,
    question text NOT NULL,
    question_hash character varying(64) NOT NULL,
    source character varying(50) DEFAULT 'user_chat'::character varying,
    quality_score numeric(3,2) DEFAULT 0.5,
    usage_count integer DEFAULT 0,
    click_count integer DEFAULT 0,
    language character varying(5) DEFAULT 'tr'::character varying,
    category character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE user_question_pool; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_question_pool IS 'Stores quality user questions for suggestion pool enrichment';


--
-- Name: user_question_pool_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_question_pool_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_question_pool_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_question_pool_id_seq OWNED BY public.user_question_pool.id;


--
-- Name: user_schema_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_schema_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    active_schema_id uuid,
    active_schema_type character varying(20),
    enable_auto_detect boolean DEFAULT true,
    max_fields_in_citation integer DEFAULT 4,
    max_questions integer DEFAULT 3,
    preferred_industry character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE user_schema_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_schema_settings IS 'User preferences for schema selection and behavior';


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    token text NOT NULL,
    refresh_token text,
    expires_at timestamp without time zone NOT NULL,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp without time zone DEFAULT now(),
    session_token character varying(255),
    last_accessed timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    plan_id uuid,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying,
    payment_method character varying(50),
    payment_id character varying(255),
    auto_renew boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_subscriptions_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('cancelled'::character varying)::text, ('expired'::character varying)::text, ('suspended'::character varying)::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'user'::character varying,
    status character varying(50) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    last_login timestamp without time zone,
    subscription_type character varying(50),
    subscription_end_date timestamp without time zone,
    email_verified boolean DEFAULT false,
    verification_token character varying(255),
    reset_token character varying(255),
    reset_token_expires timestamp without time zone,
    username character varying(50),
    password_hash character varying(255),
    first_name character varying(100),
    last_name character varying(100),
    is_active boolean DEFAULT true,
    profile_image character varying(255),
    industry character varying(50),
    active_schema_id uuid,
    subscription_tier character varying(20) DEFAULT 'free'::character varying,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('admin'::character varying)::text, ('user'::character varying)::text, ('premium'::character varying)::text]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('suspended'::character varying)::text])))
);


--
-- Name: embedding_cache id; Type: DEFAULT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.embedding_cache ALTER COLUMN id SET DEFAULT nextval('ai.embedding_cache_id_seq'::regclass);


--
-- Name: embedding_queue id; Type: DEFAULT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.embedding_queue ALTER COLUMN id SET DEFAULT nextval('ai.embedding_queue_id_seq'::regclass);


--
-- Name: entities id; Type: DEFAULT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.entities ALTER COLUMN id SET DEFAULT nextval('lightrag.entities_id_seq'::regclass);


--
-- Name: relationships id; Type: DEFAULT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.relationships ALTER COLUMN id SET DEFAULT nextval('lightrag.relationships_id_seq'::regclass);


--
-- Name: activity_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_history ALTER COLUMN id SET DEFAULT nextval('public.activity_history_id_seq'::regclass);


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);


--
-- Name: api_test_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_test_results ALTER COLUMN id SET DEFAULT nextval('public.api_test_results_id_seq'::regclass);


--
-- Name: chat_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_history ALTER COLUMN id SET DEFAULT nextval('public.chat_history_id_seq'::regclass);


--
-- Name: chatbot_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings ALTER COLUMN id SET DEFAULT nextval('public.chatbot_settings_id_seq'::regclass);


--
-- Name: chatbot_settings_ren id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings_ren ALTER COLUMN id SET DEFAULT nextval('public.chatbot_settings_id_seq1'::regclass);


--
-- Name: chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks ALTER COLUMN id SET DEFAULT nextval('public.chunks_id_seq'::regclass);


--
-- Name: document_embeddings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_embeddings ALTER COLUMN id SET DEFAULT nextval('public.document_embeddings_id_seq'::regclass);


--
-- Name: document_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_history ALTER COLUMN id SET DEFAULT nextval('public.document_history_id_seq'::regclass);


--
-- Name: document_processing_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_processing_history ALTER COLUMN id SET DEFAULT nextval('public.document_processing_history_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- Name: embedding_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_history ALTER COLUMN id SET DEFAULT nextval('public.embedding_history_id_seq'::regclass);


--
-- Name: embedding_model_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_model_usage ALTER COLUMN id SET DEFAULT nextval('public.embedding_model_usage_id_seq'::regclass);


--
-- Name: embedding_progress id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_progress ALTER COLUMN id SET DEFAULT nextval('public.embedding_progress_id_seq'::regclass);


--
-- Name: embedding_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_queue ALTER COLUMN id SET DEFAULT nextval('public.embedding_queue_id_seq'::regclass);


--
-- Name: embedding_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_stats ALTER COLUMN id SET DEFAULT nextval('public.embedding_stats_id_seq'::regclass);


--
-- Name: embedding_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_tokens ALTER COLUMN id SET DEFAULT nextval('public.embedding_tokens_id_seq'::regclass);


--
-- Name: embeddings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings ALTER COLUMN id SET DEFAULT nextval('public.embeddings_id_seq'::regclass);


--
-- Name: import_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs ALTER COLUMN id SET DEFAULT nextval('public.import_jobs_id_seq'::regclass);


--
-- Name: migration_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_history ALTER COLUMN id SET DEFAULT nextval('public.migration_history_id_seq'::regclass);


--
-- Name: migration_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_jobs ALTER COLUMN id SET DEFAULT nextval('public.migration_jobs_id_seq'::regclass);


--
-- Name: migration_progress id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_progress ALTER COLUMN id SET DEFAULT nextval('public.migration_progress_id_seq'::regclass);


--
-- Name: scraped_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_data ALTER COLUMN id SET DEFAULT nextval('public.scraped_data_id_seq'::regclass);


--
-- Name: scraped_pages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_pages ALTER COLUMN id SET DEFAULT nextval('public.scraped_pages_id_seq'::regclass);


--
-- Name: scraper_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraper_history ALTER COLUMN id SET DEFAULT nextval('public.scraper_history_id_seq'::regclass);


--
-- Name: scraper_history_detailed id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraper_history_detailed ALTER COLUMN id SET DEFAULT nextval('public.scraper_history_detailed_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: skipped_embeddings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skipped_embeddings ALTER COLUMN id SET DEFAULT nextval('public.skipped_embeddings_id_seq'::regclass);


--
-- Name: template_field_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_field_mappings ALTER COLUMN id SET DEFAULT nextval('public.template_field_mappings_id_seq'::regclass);


--
-- Name: template_table_schemas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_table_schemas ALTER COLUMN id SET DEFAULT nextval('public.template_table_schemas_id_seq'::regclass);


--
-- Name: template_transform_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_transform_rules ALTER COLUMN id SET DEFAULT nextval('public.template_transform_rules_id_seq'::regclass);


--
-- Name: transform_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transform_jobs ALTER COLUMN id SET DEFAULT nextval('public.transform_jobs_id_seq'::regclass);


--
-- Name: unified_embeddings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_embeddings ALTER COLUMN id SET DEFAULT nextval('public.unified_embeddings_id_seq'::regclass);


--
-- Name: user_question_pool id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_question_pool ALTER COLUMN id SET DEFAULT nextval('public.user_question_pool_id_seq'::regclass);


--
-- Name: config config_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.config
    ADD CONSTRAINT config_pkey PRIMARY KEY (key);


--
-- Name: embedding_cache embedding_cache_content_hash_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.embedding_cache
    ADD CONSTRAINT embedding_cache_content_hash_key UNIQUE (content_hash);


--
-- Name: embedding_cache embedding_cache_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.embedding_cache
    ADD CONSTRAINT embedding_cache_pkey PRIMARY KEY (id);


--
-- Name: embedding_queue embedding_queue_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.embedding_queue
    ADD CONSTRAINT embedding_queue_pkey PRIMARY KEY (id);


--
-- Name: embedding_queue embedding_queue_table_name_record_id_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.embedding_queue
    ADD CONSTRAINT embedding_queue_table_name_record_id_key UNIQUE (table_name, record_id);


--
-- Name: pgai_lib_feature_flag pgai_lib_feature_flag_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.pgai_lib_feature_flag
    ADD CONSTRAINT pgai_lib_feature_flag_pkey PRIMARY KEY (name);


--
-- Name: pgai_lib_migration pgai_lib_migration_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.pgai_lib_migration
    ADD CONSTRAINT pgai_lib_migration_pkey PRIMARY KEY (name);


--
-- Name: pgai_lib_version pgai_lib_version_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.pgai_lib_version
    ADD CONSTRAINT pgai_lib_version_pkey PRIMARY KEY (name);


--
-- Name: semantic_catalog semantic_catalog_catalog_name_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.semantic_catalog
    ADD CONSTRAINT semantic_catalog_catalog_name_key UNIQUE (catalog_name);


--
-- Name: semantic_catalog_embedding semantic_catalog_embedding_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.semantic_catalog_embedding
    ADD CONSTRAINT semantic_catalog_embedding_pkey PRIMARY KEY (id);


--
-- Name: semantic_catalog_embedding semantic_catalog_embedding_semantic_catalog_id_embedding_na_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.semantic_catalog_embedding
    ADD CONSTRAINT semantic_catalog_embedding_semantic_catalog_id_embedding_na_key UNIQUE (semantic_catalog_id, embedding_name);


--
-- Name: semantic_catalog semantic_catalog_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.semantic_catalog
    ADD CONSTRAINT semantic_catalog_pkey PRIMARY KEY (id);


--
-- Name: vectorizer vectorizer_name_unique; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.vectorizer
    ADD CONSTRAINT vectorizer_name_unique UNIQUE (name);


--
-- Name: vectorizer vectorizer_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.vectorizer
    ADD CONSTRAINT vectorizer_pkey PRIMARY KEY (id);


--
-- Name: vectorizer_worker_process vectorizer_worker_process_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.vectorizer_worker_process
    ADD CONSTRAINT vectorizer_worker_process_pkey PRIMARY KEY (id);


--
-- Name: vectorizer_worker_progress vectorizer_worker_progress_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.vectorizer_worker_progress
    ADD CONSTRAINT vectorizer_worker_progress_pkey PRIMARY KEY (vectorizer_id);


--
-- Name: entities entities_name_type_key; Type: CONSTRAINT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.entities
    ADD CONSTRAINT entities_name_type_key UNIQUE (name, type);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);


--
-- Name: entity_documents entity_documents_pkey; Type: CONSTRAINT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.entity_documents
    ADD CONSTRAINT entity_documents_pkey PRIMARY KEY (entity_id, document_id);


--
-- Name: relationships relationships_pkey; Type: CONSTRAINT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.relationships
    ADD CONSTRAINT relationships_pkey PRIMARY KEY (id);


--
-- Name: relationships relationships_source_entity_id_target_entity_id_type_key; Type: CONSTRAINT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.relationships
    ADD CONSTRAINT relationships_source_entity_id_target_entity_id_type_key UNIQUE (source_entity_id, target_entity_id, type);


--
-- Name: activity_history activity_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_history
    ADD CONSTRAINT activity_history_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: api_test_results api_test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_test_results
    ADD CONSTRAINT api_test_results_pkey PRIMARY KEY (id);


--
-- Name: apscheduler_jobs apscheduler_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apscheduler_jobs
    ADD CONSTRAINT apscheduler_jobs_pkey PRIMARY KEY (id);


--
-- Name: chat_history chat_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_history
    ADD CONSTRAINT chat_history_pkey PRIMARY KEY (id);


--
-- Name: chatbot_settings chatbot_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings
    ADD CONSTRAINT chatbot_settings_pkey PRIMARY KEY (id);


--
-- Name: chatbot_settings_ren chatbot_settings_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings_ren
    ADD CONSTRAINT chatbot_settings_pkey1 PRIMARY KEY (id);


--
-- Name: chatbot_settings chatbot_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings
    ADD CONSTRAINT chatbot_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: chatbot_settings_ren chatbot_settings_setting_key_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_settings_ren
    ADD CONSTRAINT chatbot_settings_setting_key_key1 UNIQUE (setting_key);


--
-- Name: chunks chunks_document_id_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_document_id_chunk_index_key UNIQUE (document_id, chunk_index);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: document_embeddings document_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_embeddings
    ADD CONSTRAINT document_embeddings_pkey PRIMARY KEY (id);


--
-- Name: document_history document_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_history
    ADD CONSTRAINT document_history_pkey PRIMARY KEY (id);


--
-- Name: document_processing_history document_processing_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_processing_history
    ADD CONSTRAINT document_processing_history_pkey PRIMARY KEY (id);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: document_templates document_templates_template_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_template_id_key UNIQUE (template_id);


--
-- Name: documents documents_filename_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_filename_unique UNIQUE (filename);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: embedding_history embedding_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_history
    ADD CONSTRAINT embedding_history_pkey PRIMARY KEY (id);


--
-- Name: embedding_model_usage embedding_model_usage_model_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_model_usage
    ADD CONSTRAINT embedding_model_usage_model_name_key UNIQUE (model_name);


--
-- Name: embedding_model_usage embedding_model_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_model_usage
    ADD CONSTRAINT embedding_model_usage_pkey PRIMARY KEY (id);


--
-- Name: embedding_progress embedding_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_progress
    ADD CONSTRAINT embedding_progress_pkey PRIMARY KEY (id);


--
-- Name: embedding_queue embedding_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_queue
    ADD CONSTRAINT embedding_queue_pkey PRIMARY KEY (id);


--
-- Name: embedding_queue embedding_queue_table_name_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_queue
    ADD CONSTRAINT embedding_queue_table_name_record_id_key UNIQUE (table_name, record_id);


--
-- Name: embedding_stats embedding_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_stats
    ADD CONSTRAINT embedding_stats_pkey PRIMARY KEY (id);


--
-- Name: embedding_stats embedding_stats_table_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_stats
    ADD CONSTRAINT embedding_stats_table_name_key UNIQUE (table_name);


--
-- Name: embedding_tokens embedding_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_tokens
    ADD CONSTRAINT embedding_tokens_pkey PRIMARY KEY (id);


--
-- Name: embeddings embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT embeddings_pkey PRIMARY KEY (id);


--
-- Name: import_jobs import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_pkey PRIMARY KEY (id);


--
-- Name: industry_presets industry_presets_industry_code_schema_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industry_presets
    ADD CONSTRAINT industry_presets_industry_code_schema_name_key UNIQUE (industry_code, schema_name);


--
-- Name: industry_presets industry_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industry_presets
    ADD CONSTRAINT industry_presets_pkey PRIMARY KEY (id);


--
-- Name: job_execution_logs job_execution_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_execution_logs
    ADD CONSTRAINT job_execution_logs_pkey PRIMARY KEY (id);


--
-- Name: message_embeddings message_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_embeddings
    ADD CONSTRAINT message_embeddings_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: migration_history migration_history_migration_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_history
    ADD CONSTRAINT migration_history_migration_id_key UNIQUE (migration_id);


--
-- Name: migration_history migration_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_history
    ADD CONSTRAINT migration_history_pkey PRIMARY KEY (id);


--
-- Name: migration_jobs migration_jobs_job_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_jobs
    ADD CONSTRAINT migration_jobs_job_name_key UNIQUE (job_name);


--
-- Name: migration_jobs migration_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_jobs
    ADD CONSTRAINT migration_jobs_pkey PRIMARY KEY (id);


--
-- Name: migration_progress migration_progress_migration_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_progress
    ADD CONSTRAINT migration_progress_migration_name_key UNIQUE (migration_name);


--
-- Name: migration_progress migration_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_progress
    ADD CONSTRAINT migration_progress_pkey PRIMARY KEY (id);


--
-- Name: project_sites project_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sites
    ADD CONSTRAINT project_sites_pkey PRIMARY KEY (id);


--
-- Name: project_sites project_sites_project_id_site_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sites
    ADD CONSTRAINT project_sites_project_id_site_id_key UNIQUE (project_id, site_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: scheduled_jobs scheduled_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_jobs
    ADD CONSTRAINT scheduled_jobs_pkey PRIMARY KEY (id);


--
-- Name: scrape_embeddings scrape_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrape_embeddings
    ADD CONSTRAINT scrape_embeddings_pkey PRIMARY KEY (id);


--
-- Name: scrape_jobs scrape_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrape_jobs
    ADD CONSTRAINT scrape_jobs_pkey PRIMARY KEY (id);


--
-- Name: scrape_statistics scrape_statistics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrape_statistics
    ADD CONSTRAINT scrape_statistics_pkey PRIMARY KEY (id);


--
-- Name: scraped_content scraped_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_content
    ADD CONSTRAINT scraped_content_pkey PRIMARY KEY (id);


--
-- Name: scraped_data scraped_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_data
    ADD CONSTRAINT scraped_data_pkey PRIMARY KEY (id);


--
-- Name: scraped_data scraped_data_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_data
    ADD CONSTRAINT scraped_data_url_key UNIQUE (url);


--
-- Name: scraped_pages scraped_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_pages
    ADD CONSTRAINT scraped_pages_pkey PRIMARY KEY (id);


--
-- Name: scraped_pages scraped_pages_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_pages
    ADD CONSTRAINT scraped_pages_url_key UNIQUE (url);


--
-- Name: scraper_history_detailed scraper_history_detailed_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraper_history_detailed
    ADD CONSTRAINT scraper_history_detailed_pkey PRIMARY KEY (id);


--
-- Name: scraper_history scraper_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraper_history
    ADD CONSTRAINT scraper_history_pkey PRIMARY KEY (id);


--
-- Name: scraping_projects scraping_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraping_projects
    ADD CONSTRAINT scraping_projects_pkey PRIMARY KEY (id);


--
-- Name: settings settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_key_key UNIQUE (key);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: site_configurations site_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_configurations
    ADD CONSTRAINT site_configurations_pkey PRIMARY KEY (id);


--
-- Name: sites sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_pkey PRIMARY KEY (id);


--
-- Name: skipped_embeddings skipped_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skipped_embeddings
    ADD CONSTRAINT skipped_embeddings_pkey PRIMARY KEY (id);


--
-- Name: skipped_embeddings skipped_embeddings_source_table_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skipped_embeddings
    ADD CONSTRAINT skipped_embeddings_source_table_source_id_key UNIQUE (source_table, source_id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: template_field_mappings template_field_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_field_mappings
    ADD CONSTRAINT template_field_mappings_pkey PRIMARY KEY (id);


--
-- Name: template_field_mappings template_field_mappings_template_id_source_field_target_tab_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_field_mappings
    ADD CONSTRAINT template_field_mappings_template_id_source_field_target_tab_key UNIQUE (template_id, source_field, target_table, target_column);


--
-- Name: template_table_schemas template_table_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_table_schemas
    ADD CONSTRAINT template_table_schemas_pkey PRIMARY KEY (id);


--
-- Name: template_table_schemas template_table_schemas_template_id_table_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_table_schemas
    ADD CONSTRAINT template_table_schemas_template_id_table_name_key UNIQUE (template_id, table_name);


--
-- Name: template_transform_rules template_transform_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_transform_rules
    ADD CONSTRAINT template_transform_rules_pkey PRIMARY KEY (id);


--
-- Name: template_transform_rules template_transform_rules_template_id_rule_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_transform_rules
    ADD CONSTRAINT template_transform_rules_template_id_rule_name_key UNIQUE (template_id, rule_name);


--
-- Name: transform_jobs transform_jobs_job_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transform_jobs
    ADD CONSTRAINT transform_jobs_job_id_key UNIQUE (job_id);


--
-- Name: transform_jobs transform_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transform_jobs
    ADD CONSTRAINT transform_jobs_pkey PRIMARY KEY (id);


--
-- Name: unified_embeddings unified_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_embeddings
    ADD CONSTRAINT unified_embeddings_pkey PRIMARY KEY (id);


--
-- Name: unified_embeddings unique_source_record; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_embeddings
    ADD CONSTRAINT unique_source_record UNIQUE (source_table, source_id);


--
-- Name: user_activity_logs user_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_logs
    ADD CONSTRAINT user_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: user_question_pool user_question_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_question_pool
    ADD CONSTRAINT user_question_pool_pkey PRIMARY KEY (id);


--
-- Name: user_question_pool user_question_pool_question_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_question_pool
    ADD CONSTRAINT user_question_pool_question_hash_key UNIQUE (question_hash);


--
-- Name: user_schema_settings user_schema_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schema_settings
    ADD CONSTRAINT user_schema_settings_pkey PRIMARY KEY (id);


--
-- Name: user_schema_settings user_schema_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schema_settings
    ADD CONSTRAINT user_schema_settings_user_id_key UNIQUE (user_id);


--
-- Name: user_schemas user_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schemas
    ADD CONSTRAINT user_schemas_pkey PRIMARY KEY (id);


--
-- Name: user_schemas user_schemas_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schemas
    ADD CONSTRAINT user_schemas_user_id_name_key UNIQUE (user_id, name);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_unique UNIQUE (user_id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: _vectorizer_errors_id_recorded_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX _vectorizer_errors_id_recorded_idx ON ai._vectorizer_errors USING btree (id, recorded);


--
-- Name: idx_ai_cache_hash; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX idx_ai_cache_hash ON ai.embedding_cache USING btree (content_hash);


--
-- Name: idx_ai_queue_status; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX idx_ai_queue_status ON ai.embedding_queue USING btree (status, created_at);


--
-- Name: vectorizer_worker_process_last_heartbeat_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX vectorizer_worker_process_last_heartbeat_idx ON ai.vectorizer_worker_process USING btree (last_heartbeat);


--
-- Name: idx_entities_name; Type: INDEX; Schema: lightrag; Owner: -
--

CREATE INDEX idx_entities_name ON lightrag.entities USING btree (name);


--
-- Name: idx_entities_type; Type: INDEX; Schema: lightrag; Owner: -
--

CREATE INDEX idx_entities_type ON lightrag.entities USING btree (type);


--
-- Name: idx_entity_documents_document_id; Type: INDEX; Schema: lightrag; Owner: -
--

CREATE INDEX idx_entity_documents_document_id ON lightrag.entity_documents USING btree (document_id);


--
-- Name: idx_relationships_source; Type: INDEX; Schema: lightrag; Owner: -
--

CREATE INDEX idx_relationships_source ON lightrag.relationships USING btree (source_entity_id);


--
-- Name: idx_relationships_target; Type: INDEX; Schema: lightrag; Owner: -
--

CREATE INDEX idx_relationships_target ON lightrag.relationships USING btree (target_entity_id);


--
-- Name: idx_relationships_type; Type: INDEX; Schema: lightrag; Owner: -
--

CREATE INDEX idx_relationships_type ON lightrag.relationships USING btree (type);


--
-- Name: idx_activity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_created ON public.activity_history USING btree (created_at DESC);


--
-- Name: idx_activity_log_activity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_activity_type ON public.activity_log USING btree (activity_type);


--
-- Name: idx_activity_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_created_at ON public.activity_log USING btree (created_at DESC);


--
-- Name: idx_activity_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_user_id ON public.activity_log USING btree (user_id);


--
-- Name: idx_activity_operation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_operation ON public.activity_history USING btree (operation_type);


--
-- Name: idx_activity_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_status ON public.activity_history USING btree (status);


--
-- Name: idx_apscheduler_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apscheduler_next_run ON public.apscheduler_jobs USING btree (next_run_time);


--
-- Name: idx_chatbot_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_settings_key ON public.chatbot_settings_ren USING btree (setting_key);


--
-- Name: idx_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chunks_embedding ON public.chunks USING ivfflat (embedding public.vector_cosine_ops);


--
-- Name: idx_conversations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_created_at ON public.conversations USING btree (created_at DESC);


--
-- Name: idx_conversations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_user_id ON public.conversations USING btree (user_id);


--
-- Name: idx_document_embeddings_chunk_text_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_chunk_text_trgm ON public.document_embeddings USING gin (chunk_text public.gin_trgm_ops);


--
-- Name: idx_document_embeddings_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_created ON public.document_embeddings USING btree (created_at DESC);


--
-- Name: idx_document_embeddings_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_created_at ON public.document_embeddings USING btree (created_at);


--
-- Name: idx_document_embeddings_doc_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_doc_id ON public.document_embeddings USING btree (document_id);


--
-- Name: idx_document_embeddings_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_document_id ON public.document_embeddings USING btree (document_id);


--
-- Name: idx_document_embeddings_vector_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_vector_hnsw ON public.document_embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_documents_file_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_file_path ON public.documents USING btree (file_path);


--
-- Name: idx_documents_file_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_file_type ON public.documents USING btree (file_type);


--
-- Name: idx_documents_filename_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_filename_table ON public.documents USING btree (original_filename, target_table_name);


--
-- Name: idx_documents_original_filename; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_original_filename ON public.documents USING btree (original_filename);


--
-- Name: idx_documents_processing_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_processing_status ON public.documents USING btree (processing_status);


--
-- Name: idx_documents_source_db_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_source_db_id ON public.documents USING btree (source_db_id);


--
-- Name: idx_documents_transform_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_transform_status ON public.documents USING btree (transform_status);


--
-- Name: idx_embedding_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embedding_history_created_at ON public.embedding_history USING btree (created_at);


--
-- Name: idx_embedding_history_operation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embedding_history_operation_id ON public.embedding_history USING btree (operation_id);


--
-- Name: idx_embedding_history_source_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embedding_history_source_table ON public.embedding_history USING btree (source_table);


--
-- Name: idx_embedding_history_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embedding_history_started_at ON public.embedding_history USING btree (started_at);


--
-- Name: idx_embedding_history_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embedding_history_status ON public.embedding_history USING btree (status);


--
-- Name: idx_embedding_progress_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embedding_progress_status ON public.embedding_progress USING btree (status);


--
-- Name: idx_embedding_tokens_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embedding_tokens_created ON public.embedding_tokens USING btree (created_at DESC);


--
-- Name: idx_embedding_tokens_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embedding_tokens_model ON public.embedding_tokens USING btree (model_used);


--
-- Name: idx_embedding_tokens_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_embedding_tokens_table ON public.embedding_tokens USING btree (table_name, record_id);


--
-- Name: idx_import_jobs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_jobs_created_at ON public.import_jobs USING btree (created_at DESC);


--
-- Name: idx_import_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_jobs_status ON public.import_jobs USING btree (status);


--
-- Name: idx_import_jobs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_jobs_user_id ON public.import_jobs USING btree (user_id);


--
-- Name: idx_industry_presets_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_industry_presets_code ON public.industry_presets USING btree (industry_code);


--
-- Name: idx_industry_presets_llm_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_industry_presets_llm_config ON public.industry_presets USING gin (llm_config);


--
-- Name: idx_industry_presets_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_industry_presets_tier ON public.industry_presets USING btree (tier);


--
-- Name: idx_job_logs_failed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_logs_failed ON public.job_execution_logs USING btree (job_id, started_at DESC) WHERE ((status)::text = 'failed'::text);


--
-- Name: idx_job_logs_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_logs_job_id ON public.job_execution_logs USING btree (job_id);


--
-- Name: idx_job_logs_job_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_logs_job_status ON public.job_execution_logs USING btree (job_id, status);


--
-- Name: idx_job_logs_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_logs_started ON public.job_execution_logs USING btree (started_at DESC);


--
-- Name: idx_job_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_logs_status ON public.job_execution_logs USING btree (status);


--
-- Name: idx_message_embeddings_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_embeddings_created ON public.message_embeddings USING btree (created_at DESC);


--
-- Name: idx_message_embeddings_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_embeddings_created_at ON public.message_embeddings USING btree (created_at DESC);


--
-- Name: idx_message_embeddings_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_embeddings_message_id ON public.message_embeddings USING btree (message_id);


--
-- Name: idx_message_embeddings_msg_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_embeddings_msg_id ON public.message_embeddings USING btree (message_id);


--
-- Name: idx_message_embeddings_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_embeddings_session ON public.message_embeddings USING btree (session_id);


--
-- Name: idx_message_embeddings_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_embeddings_session_id ON public.message_embeddings USING btree (session_id);


--
-- Name: idx_message_embeddings_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_embeddings_vector ON public.message_embeddings USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_message_embeddings_vector_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_embeddings_vector_hnsw ON public.message_embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at);


--
-- Name: idx_messages_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_model ON public.messages USING btree (model);


--
-- Name: idx_migration_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_history_created_at ON public.migration_history USING btree (created_at DESC);


--
-- Name: idx_migration_history_migration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_history_migration_id ON public.migration_history USING btree (migration_id);


--
-- Name: idx_migration_history_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_history_source ON public.migration_history USING btree (source_type, source_name);


--
-- Name: idx_migration_history_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_history_status ON public.migration_history USING btree (status);


--
-- Name: idx_migration_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_jobs_status ON public.migration_jobs USING btree (status, created_at DESC);


--
-- Name: idx_migration_progress_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_progress_name ON public.migration_progress USING btree (migration_name);


--
-- Name: idx_migration_progress_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_progress_status ON public.migration_progress USING btree (status);


--
-- Name: idx_scheduled_jobs_apscheduler; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_jobs_apscheduler ON public.scheduled_jobs USING btree (apscheduler_job_id);


--
-- Name: idx_scheduled_jobs_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_jobs_created_by ON public.scheduled_jobs USING btree (created_by);


--
-- Name: idx_scheduled_jobs_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_jobs_enabled ON public.scheduled_jobs USING btree (enabled) WHERE (enabled = true);


--
-- Name: idx_scheduled_jobs_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_jobs_next_run ON public.scheduled_jobs USING btree (next_run_at) WHERE (enabled = true);


--
-- Name: idx_scheduled_jobs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_jobs_type ON public.scheduled_jobs USING btree (job_type);


--
-- Name: idx_scrape_embeddings_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_content_type ON public.scrape_embeddings USING btree (content_type);


--
-- Name: idx_scrape_embeddings_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_created_at ON public.scrape_embeddings USING btree (created_at DESC);


--
-- Name: idx_scrape_embeddings_entity_types; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_entity_types ON public.scrape_embeddings USING gin (entity_types);


--
-- Name: idx_scrape_embeddings_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_language ON public.scrape_embeddings USING btree (language);


--
-- Name: idx_scrape_embeddings_llm_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_llm_processed ON public.scrape_embeddings USING btree (llm_processed);


--
-- Name: idx_scrape_embeddings_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_metadata ON public.scrape_embeddings USING gin (metadata);


--
-- Name: idx_scrape_embeddings_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_parent_id ON public.scrape_embeddings USING btree (parent_id);


--
-- Name: idx_scrape_embeddings_processed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_processed_at ON public.scrape_embeddings USING btree (processed_at DESC);


--
-- Name: idx_scrape_embeddings_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_project_id ON public.scrape_embeddings USING btree (project_id);


--
-- Name: idx_scrape_embeddings_project_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_project_status ON public.scrape_embeddings USING btree (project_id, processing_status);


--
-- Name: idx_scrape_embeddings_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_session_id ON public.scrape_embeddings USING btree (scrape_session_id);


--
-- Name: idx_scrape_embeddings_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_site_id ON public.scrape_embeddings USING btree (site_id);


--
-- Name: idx_scrape_embeddings_site_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_site_type ON public.scrape_embeddings USING btree (site_id, content_type);


--
-- Name: idx_scrape_embeddings_url_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_url_hash ON public.scrape_embeddings USING btree (md5(source_url));


--
-- Name: idx_scrape_embeddings_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrape_embeddings_vector ON public.scrape_embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_scraped_content_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraped_content_category ON public.scraped_content USING btree (category);


--
-- Name: idx_scraped_content_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraped_content_created_at ON public.scraped_content USING btree (created_at DESC);


--
-- Name: idx_scraped_content_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraped_content_processed ON public.scraped_content USING btree (processed);


--
-- Name: idx_scraped_content_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraped_content_project ON public.scraped_content USING btree (project_id);


--
-- Name: idx_scraped_content_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraped_content_url ON public.scraped_content USING btree (url);


--
-- Name: idx_scraped_data_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraped_data_created ON public.scraped_data USING btree (created_at DESC);


--
-- Name: idx_scraped_data_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraped_data_created_at ON public.scraped_data USING btree (created_at DESC);


--
-- Name: idx_scraped_data_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraped_data_url ON public.scraped_data USING btree (url);


--
-- Name: idx_skipped_embeddings_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skipped_embeddings_source ON public.skipped_embeddings USING btree (source_table, source_id);


--
-- Name: idx_skipped_embeddings_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skipped_embeddings_table ON public.skipped_embeddings USING btree (source_table);


--
-- Name: idx_template_field_mappings_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_field_mappings_template ON public.template_field_mappings USING btree (template_id);


--
-- Name: idx_template_table_schemas_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_table_schemas_template ON public.template_table_schemas USING btree (template_id);


--
-- Name: idx_template_transform_rules_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_transform_rules_template ON public.template_transform_rules USING btree (template_id);


--
-- Name: idx_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_category ON public.document_templates USING btree (category);


--
-- Name: idx_templates_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_is_active ON public.document_templates USING btree (is_active);


--
-- Name: idx_templates_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_priority ON public.document_templates USING btree (priority DESC);


--
-- Name: idx_templates_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_template_id ON public.document_templates USING btree (template_id);


--
-- Name: idx_transform_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transform_jobs_status ON public.transform_jobs USING btree (status);


--
-- Name: idx_unified_embeddings_content_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_embeddings_content_hash ON public.unified_embeddings USING btree (content_hash);


--
-- Name: idx_unified_embeddings_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_embeddings_created_at ON public.unified_embeddings USING btree (created_at);


--
-- Name: idx_unified_embeddings_embedding_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_embeddings_embedding_vector ON public.unified_embeddings USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_unified_embeddings_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_embeddings_source_id ON public.unified_embeddings USING btree (source_id);


--
-- Name: idx_unified_embeddings_source_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_embeddings_source_name ON public.unified_embeddings USING btree (source_name);


--
-- Name: idx_unified_embeddings_source_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_embeddings_source_table ON public.unified_embeddings USING btree (source_table);


--
-- Name: idx_unified_embeddings_source_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_embeddings_source_type ON public.unified_embeddings USING btree (source_type);


--
-- Name: idx_unified_embeddings_tokens; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_embeddings_tokens ON public.unified_embeddings USING btree (tokens_used) WHERE (tokens_used > 0);


--
-- Name: idx_unified_embeddings_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_embeddings_type ON public.unified_embeddings USING btree (source_type);


--
-- Name: idx_user_activity_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_logs_created_at ON public.user_activity_logs USING btree (created_at);


--
-- Name: idx_user_activity_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_logs_user_id ON public.user_activity_logs USING btree (user_id);


--
-- Name: idx_user_question_pool_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_question_pool_active ON public.user_question_pool USING btree (is_active);


--
-- Name: idx_user_question_pool_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_question_pool_hash ON public.user_question_pool USING btree (question_hash);


--
-- Name: idx_user_question_pool_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_question_pool_language ON public.user_question_pool USING btree (language);


--
-- Name: idx_user_question_pool_quality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_question_pool_quality ON public.user_question_pool USING btree (quality_score DESC);


--
-- Name: idx_user_schemas_llm_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_schemas_llm_config ON public.user_schemas USING gin (llm_config);


--
-- Name: idx_user_schemas_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_schemas_source ON public.user_schemas USING btree (source_preset_id);


--
-- Name: idx_user_schemas_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_schemas_user_id ON public.user_schemas USING btree (user_id);


--
-- Name: idx_user_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_token ON public.user_sessions USING btree (token);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_industry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_industry ON public.users USING btree (industry);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: unified_embeddings_record_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unified_embeddings_record_type_idx ON public.unified_embeddings USING btree (((metadata ->> 'table'::text)));


--
-- Name: unified_embeddings auto_generate_content_hash; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_generate_content_hash BEFORE INSERT OR UPDATE OF content ON public.unified_embeddings FOR EACH ROW EXECUTE FUNCTION public.generate_content_hash();


--
-- Name: scrape_embeddings scrape_embeddings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER scrape_embeddings_updated_at BEFORE UPDATE ON public.scrape_embeddings FOR EACH ROW EXECUTE FUNCTION public.update_scrape_embeddings_updated_at();


--
-- Name: settings sync_api_settings_to_ai; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_api_settings_to_ai AFTER INSERT OR UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION ai.sync_api_settings();


--
-- Name: import_jobs trigger_import_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_import_jobs_updated_at BEFORE UPDATE ON public.import_jobs FOR EACH ROW EXECUTE FUNCTION public.update_import_jobs_updated_at();


--
-- Name: job_execution_logs trigger_job_duration; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_job_duration BEFORE UPDATE ON public.job_execution_logs FOR EACH ROW EXECUTE FUNCTION public.calculate_job_duration();


--
-- Name: scheduled_jobs trigger_scheduled_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_scheduled_jobs_updated_at BEFORE UPDATE ON public.scheduled_jobs FOR EACH ROW EXECUTE FUNCTION public.update_scheduled_jobs_updated_at();


--
-- Name: message_embeddings trigger_update_message_embeddings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_message_embeddings_updated_at BEFORE UPDATE ON public.message_embeddings FOR EACH ROW EXECUTE FUNCTION public.update_message_embeddings_updated_at();


--
-- Name: conversations update_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: document_embeddings update_document_embeddings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_document_embeddings_updated_at BEFORE UPDATE ON public.document_embeddings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: document_templates update_document_templates_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_document_templates_timestamp BEFORE UPDATE ON public.document_templates FOR EACH ROW EXECUTE FUNCTION public.update_template_timestamp();


--
-- Name: industry_presets update_industry_presets_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_industry_presets_timestamp BEFORE UPDATE ON public.industry_presets FOR EACH ROW EXECUTE FUNCTION public.update_schema_timestamp();


--
-- Name: message_embeddings update_message_embeddings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_message_embeddings_updated_at BEFORE UPDATE ON public.message_embeddings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: migration_progress update_migration_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_migration_progress_updated_at BEFORE UPDATE ON public.migration_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scraped_content update_scraped_content_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_scraped_content_updated_at BEFORE UPDATE ON public.scraped_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scraping_projects update_scraping_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_scraping_projects_updated_at BEFORE UPDATE ON public.scraping_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: site_configurations update_site_configurations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_site_configurations_updated_at BEFORE UPDATE ON public.site_configurations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: unified_embeddings update_unified_embeddings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_unified_embeddings_updated_at BEFORE UPDATE ON public.unified_embeddings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_schemas update_user_schemas_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_schemas_timestamp BEFORE UPDATE ON public.user_schemas FOR EACH ROW EXECUTE FUNCTION public.update_schema_timestamp();


--
-- Name: user_sessions update_user_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: semantic_catalog_embedding semantic_catalog_embedding_semantic_catalog_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.semantic_catalog_embedding
    ADD CONSTRAINT semantic_catalog_embedding_semantic_catalog_id_fkey FOREIGN KEY (semantic_catalog_id) REFERENCES ai.semantic_catalog(id) ON DELETE CASCADE;


--
-- Name: _vectorizer_errors vectorizer_errors_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai._vectorizer_errors
    ADD CONSTRAINT vectorizer_errors_id_fkey FOREIGN KEY (id) REFERENCES ai.vectorizer(id) ON DELETE CASCADE;


--
-- Name: vectorizer_worker_progress vectorizer_worker_progress_vectorizer_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.vectorizer_worker_progress
    ADD CONSTRAINT vectorizer_worker_progress_vectorizer_id_fkey FOREIGN KEY (vectorizer_id) REFERENCES ai.vectorizer(id) ON DELETE CASCADE;


--
-- Name: entity_documents entity_documents_entity_id_fkey; Type: FK CONSTRAINT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.entity_documents
    ADD CONSTRAINT entity_documents_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES lightrag.entities(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_source_entity_id_fkey; Type: FK CONSTRAINT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.relationships
    ADD CONSTRAINT relationships_source_entity_id_fkey FOREIGN KEY (source_entity_id) REFERENCES lightrag.entities(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_target_entity_id_fkey; Type: FK CONSTRAINT; Schema: lightrag; Owner: -
--

ALTER TABLE ONLY lightrag.relationships
    ADD CONSTRAINT relationships_target_entity_id_fkey FOREIGN KEY (target_entity_id) REFERENCES lightrag.entities(id) ON DELETE CASCADE;


--
-- Name: document_processing_history document_processing_history_migration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_processing_history
    ADD CONSTRAINT document_processing_history_migration_id_fkey FOREIGN KEY (migration_id) REFERENCES public.migration_history(migration_id);


--
-- Name: job_execution_logs job_execution_logs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_execution_logs
    ADD CONSTRAINT job_execution_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.scheduled_jobs(id) ON DELETE CASCADE;


--
-- Name: message_embeddings message_embeddings_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_embeddings
    ADD CONSTRAINT message_embeddings_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: project_sites project_sites_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_sites
    ADD CONSTRAINT project_sites_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: scrape_embeddings scrape_embeddings_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrape_embeddings
    ADD CONSTRAINT scrape_embeddings_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.scrape_embeddings(id);


--
-- Name: scrape_jobs scrape_jobs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrape_jobs
    ADD CONSTRAINT scrape_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: scraped_content scraped_content_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_content
    ADD CONSTRAINT scraped_content_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.scraping_projects(id);


--
-- Name: scraped_content scraped_content_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_content
    ADD CONSTRAINT scraped_content_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.site_configurations(id);


--
-- Name: scraper_history_detailed scraper_history_detailed_migration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraper_history_detailed
    ADD CONSTRAINT scraper_history_detailed_migration_id_fkey FOREIGN KEY (migration_id) REFERENCES public.migration_history(migration_id);


--
-- Name: user_activity_logs user_activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_logs
    ADD CONSTRAINT user_activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_schema_settings user_schema_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schema_settings
    ADD CONSTRAINT user_schema_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_schemas user_schemas_source_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schemas
    ADD CONSTRAINT user_schemas_source_preset_id_fkey FOREIGN KEY (source_preset_id) REFERENCES public.industry_presets(id) ON DELETE SET NULL;


--
-- Name: user_schemas user_schemas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schemas
    ADD CONSTRAINT user_schemas_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict yGaPKedrFHb0Yw9jh6iJh6IytJXG8t5g6waZzL1la295SGYKt7hV3M8tx8EUHo7

