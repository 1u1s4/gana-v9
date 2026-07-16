#!/usr/bin/env python3
"""Safely copy Gana v9 data from MySQL to an existing PostgreSQL schema.

The utility deliberately does not create or alter schema objects.  It expects the
PostgreSQL/Supabase schema to exist and to contain the same 33 domain tables as
the source database.  Connection strings are accepted only through environment
variables so they cannot leak through process arguments or shell history:

    SOURCE_DATABASE_URL  MySQL source (falls back to DATABASE_URL)
    TARGET_DATABASE_URL  PostgreSQL/Supabase target

Runtime dependencies (kept outside the Node package manifest):

    python -m pip install mysql-connector-python psycopg2-binary python-dotenv

Commands emit one JSON document containing schema metadata, counts, and hashes;
they never emit row data or connection strings.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import decimal
import hashlib
import io
import json
import math
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Iterable, Iterator, Mapping, Sequence
from urllib.parse import parse_qs, unquote, urlparse


EXPECTED_SOURCE_DATABASE = "gana_v9_ops_20260425"
EXCLUDED_TABLES = frozenset({"_prisma_migrations"})
TARGET_AUXILIARY_TABLES = frozenset({"provider_quota_daily"})
HISTORICAL_SNAPSHOT_BACKFILL_TABLES = (
    "provider_snapshots",
    "odds_snapshots",
)
PROFILE_FULL = "full"
PROFILE_COMPACT_FREE = "compact-free"
PROFILE_NAMES = (PROFILE_FULL, PROFILE_COMPACT_FREE)
COMPACT_POLICY_VERSION = (
    "compact-free-v6-60d-history-7d-raw-json-lineage-"
    "referenced-catalogs-retention-fixed-point"
)
COMPACT_MAX_HISTORY_DAYS = 60
COMPACT_RAW_RETENTION_DAYS = 7
COMPACT_ANALYTIC_RETENTION_DAYS = 30
COMPACT_RESEARCH_RETENTION_DAYS = 14
COMPACT_VALIDATION_RETENTION_DAYS = 14
COMPACT_TRANSIENT_RETENTION_DAYS = 7
COMPACT_BLOB_RETENTION_DAYS = 14
COMPACT_PAYLOAD_RETENTION_DAYS = 7
COMPACT_FREE_MAX_ESTIMATED_BYTES = 330 * 1024 * 1024
TARGET_SIZE_ALERT_BYTES = 350 * 1024 * 1024
TARGET_SIZE_HARD_LIMIT_BYTES = 400 * 1024 * 1024
MINIMAL_FREE_PROFILE_AVAILABLE = False
POSTGRES_ESTIMATE_MULTIPLIER = decimal.Decimal("1.35")

# This is an intentional allow-list.  Copying an unexpected table from the
# DigitalOcean server could move unrelated data into Supabase.
DOMAIN_TABLES = frozenset(
    {
        "approval_requests",
        "artifacts",
        "audit_logs",
        "claims",
        "competitions",
        "daily_metrics",
        "evidence_items",
        "fixtures",
        "gambeta_current_picks",
        "gambeta_current_stats",
        "gambeta_pick_snapshots",
        "gambeta_scrape_runs",
        "harness_runs",
        "harness_tasks",
        "leaderboard_entries",
        "league_presets",
        "low_odds_hits",
        "low_odds_scans",
        "odds_quotes",
        "odds_snapshots",
        "parlay_legs",
        "parlays",
        "predictions",
        "provider_quota_samples",
        "provider_snapshots",
        "public_recommendation_publications",
        "research_bundles",
        "search_filter_presets",
        "source_records",
        "sports_providers",
        "team_presets",
        "teams",
        "validation_artifacts",
    }
)

if len(DOMAIN_TABLES) != 33:  # pragma: no cover - import-time invariant
    raise RuntimeError("The domain table allow-list must contain exactly 33 tables")


# PostgreSQL intentionally adds only these consolidation fields.  Any other
# destination-only column is schema drift and blocks migration.
ALLOWED_TARGET_ONLY_COLUMNS: Mapping[str, frozenset[str]] = {
    "provider_snapshots": frozenset(
        {"dedupe_key", "last_seen_at", "observation_count"}
    ),
    "odds_snapshots": frozenset(
        {"dedupe_key", "last_seen_at", "observation_count"}
    ),
    "odds_quotes": frozenset({"content_hash"}),
}

# Only stable provider/configuration rows remain indefinitely. Historical
# metrics/publications are capped below; current Gambeta state is kept
# separately. Competitions and teams are selected exclusively by FK parent
# closure, so stale catalog rows cannot consume live-database space forever.
COMPACT_FOREVER_TABLES = frozenset(
    {
        "sports_providers",
        "league_presets",
        "team_presets",
        "search_filter_presets",
    }
)
COMPACT_REFERENCED_CATALOG_TABLES = frozenset({"competitions", "teams"})
COMPACT_CURRENT_TABLES = frozenset(
    {"gambeta_current_picks", "gambeta_current_stats"}
)

# Timestamp column/expression inputs are identifiers, never user strings.
# Fixtures use their scheduled time, falling back to ingestion time.
COMPACT_RECENT_RULES: Mapping[str, tuple[tuple[str, ...], int]] = {
    # Voluminous replayable/raw observations get only seven days.  Required
    # FK lineage can retain an individual older snapshot/quote, but never the
    # whole raw sibling set.
    "provider_snapshots": (("captured_at",), COMPACT_RAW_RETENTION_DAYS),
    "odds_snapshots": (("captured_at",), COMPACT_RAW_RETENTION_DAYS),
    "provider_quota_samples": (("sampled_at",), COMPACT_RAW_RETENTION_DAYS),
    "approval_requests": (("created_at",), COMPACT_ANALYTIC_RETENTION_DAYS),
    "artifacts": (("created_at",), COMPACT_ANALYTIC_RETENTION_DAYS),
    "audit_logs": (("created_at",), COMPACT_ANALYTIC_RETENTION_DAYS),
    "claims": (("created_at",), COMPACT_RESEARCH_RETENTION_DAYS),
    "daily_metrics": (("metric_date",), COMPACT_MAX_HISTORY_DAYS),
    "evidence_items": (("created_at",), COMPACT_RESEARCH_RETENTION_DAYS),
    "fixtures": (("scheduled_at", "created_at"), COMPACT_ANALYTIC_RETENTION_DAYS),
    "harness_runs": (("created_at",), COMPACT_ANALYTIC_RETENTION_DAYS),
    "harness_tasks": (("created_at",), COMPACT_ANALYTIC_RETENTION_DAYS),
    "leaderboard_entries": (("generated_at",), COMPACT_ANALYTIC_RETENTION_DAYS),
    "low_odds_hits": (("created_at",), COMPACT_TRANSIENT_RETENTION_DAYS),
    "low_odds_scans": (("created_at",), COMPACT_TRANSIENT_RETENTION_DAYS),
    "parlay_legs": (("created_at",), COMPACT_ANALYTIC_RETENTION_DAYS),
    "parlays": (("generated_at",), COMPACT_ANALYTIC_RETENTION_DAYS),
    "predictions": (("generated_at",), COMPACT_ANALYTIC_RETENTION_DAYS),
    "public_recommendation_publications": (
        ("published_at",),
        COMPACT_MAX_HISTORY_DAYS,
    ),
    "research_bundles": (("created_at",), COMPACT_RESEARCH_RETENTION_DAYS),
    "source_records": (("captured_at",), COMPACT_RESEARCH_RETENTION_DAYS),
    "validation_artifacts": (("evaluated_at",), COMPACT_VALIDATION_RETENTION_DAYS),
}

COMPACT_EXACT_DEDUPE_PARTITIONS: Mapping[str, tuple[str, ...]] = {
    "provider_snapshots": (
        "provider_id",
        "endpoint_name",
        "request_hash",
        "payload_hash",
    ),
    # Seven days is the eligibility window, not a request to retain every raw
    # price movement.  Keep the latest observation per fixture; required
    # prediction/publication FKs add their exact historical snapshots during
    # parent closure below.
    "odds_snapshots": ("fixture_id",),
}

# Quotes are transformed with metadata=NULL unless they are directly used by a
# retained prediction.  These columns therefore describe their exact retained
# business content.  Deduplication is scoped to one snapshot so no temporal
# observation or bookmaker/market/selection is conflated across snapshots.
COMPACT_ODDS_QUOTE_DEDUPE_PARTITION = (
    "snapshot_id",
    "fixture_id",
    "bookmaker",
    "bookmaker_key",
    "market_key",
    "selection_key",
    "line",
    "price",
    "implied_probability",
    "market_implied_probability",
    "market_fair_probability",
    "consensus_fair_odds",
    "overround",
    "market_efficiency_score",
)

# These child relations are retained only while closing durable publication or
# current-state lineage. Non-durable rows enter through their own time window;
# selecting a recent parent must not resurrect old children that the first
# retention pass would immediately delete.
COMPACT_DESCENDANT_RELATIONS = frozenset(
    {
        ("parlays", "parlay_legs"),
        ("parlays", "validation_artifacts"),
        ("predictions", "validation_artifacts"),
        ("research_bundles", "source_records"),
        ("research_bundles", "evidence_items"),
        ("research_bundles", "claims"),
        ("source_records", "evidence_items"),
        ("source_records", "claims"),
        ("gambeta_scrape_runs", "gambeta_pick_snapshots"),
    }
)

COMPACT_DERIVED_ONLY_TABLES = frozenset(
    {"odds_quotes", "gambeta_scrape_runs", "gambeta_pick_snapshots"}
)

# Nullable links into pruned raw tables become NULL instead of forcing a raw
# parent outside the selected window.  Required links (for example prediction
# -> odds_quote) are still closed normally.
COMPACT_NULLABLE_PRUNABLE_PARENT_TABLES = frozenset(
    {"provider_snapshots", "odds_quotes"}
)
COMPACT_PRESERVE_OPTIONAL_FK_EDGES: frozenset[tuple[str, str]] = frozenset()

# Some historical lineage links predate relational columns and exist only in
# JSON metadata. They are selection edges, not inferred foreign keys: only a
# selected source/validation row can pull its exact referenced snapshot. The
# source odds edge additionally pulls quotes for that one snapshot below.
COMPACT_JSON_REFERENCE_RULES: tuple[tuple[str, str, str, str], ...] = (
    ("source_records", "metadata", "snapshotId", "provider_snapshots"),
    ("source_records", "metadata", "oddsSnapshotId", "odds_snapshots"),
    (
        "validation_artifacts",
        "metadata",
        "resultProviderSnapshotId",
        "provider_snapshots",
    ),
)
COMPACT_JSON_ODDS_REFERENCE_RULE = (
    "source_records",
    "metadata",
    "oddsSnapshotId",
    "odds_snapshots",
)

# Non-durable JSON lineage exists in the target only while the metadata column
# survives COPY transformation.  Published/durable rows are unioned into this
# hot set after durable closure, so their exact historical references remain
# complete regardless of age.
COMPACT_JSON_METADATA_HOT_RULES: Mapping[str, tuple[str, ...]] = {
    "source_records": ("captured_at",),
    "validation_artifacts": ("evaluated_at",),
}

# Optional high-volume payloads are useful for short-term debugging, but are
# not needed to retain the relational recommendation/publication lineage.  The
# core business fields remain untouched.  Raw/research payloads use the
# seven-day hot horizon; other optional analytical metadata uses 14 days.
COMPACT_BLOB_PRUNE_RULES: Mapping[
    str, tuple[tuple[str, ...], int, tuple[str, ...]]
] = {
    "artifacts": (("created_at",), COMPACT_BLOB_RETENTION_DAYS, ("metadata",)),
    "claims": (
        ("created_at",),
        COMPACT_PAYLOAD_RETENTION_DAYS,
        ("evidence_ids", "warnings", "metadata"),
    ),
    "evidence_items": (
        ("created_at",),
        COMPACT_PAYLOAD_RETENTION_DAYS,
        ("snippet_redacted", "summary_redacted", "claim_ids", "warnings", "metadata"),
    ),
    "fixtures": (
        ("scheduled_at", "created_at"),
        COMPACT_PAYLOAD_RETENTION_DAYS,
        ("metadata",),
    ),
    "harness_runs": (("created_at",), COMPACT_BLOB_RETENTION_DAYS, ("metadata",)),
    "odds_snapshots": (
        ("captured_at",),
        COMPACT_RAW_RETENTION_DAYS,
        ("metadata",),
    ),
    "predictions": (
        ("generated_at",),
        COMPACT_BLOB_RETENTION_DAYS,
        ("warnings", "evidence_ids", "included_by_filters", "metadata"),
    ),
    "provider_snapshots": (
        ("captured_at",),
        COMPACT_RAW_RETENTION_DAYS,
        ("quota_metadata", "request_metadata", "raw_payload"),
    ),
    "public_recommendation_publications": (
        ("published_at",),
        COMPACT_MAX_HISTORY_DAYS,
        ("metadata",),
    ),
    "research_bundles": (
        ("created_at",),
        COMPACT_PAYLOAD_RETENTION_DAYS,
        ("gate_result", "warnings", "metadata"),
    ),
    "source_records": (
        ("captured_at",),
        COMPACT_PAYLOAD_RETENTION_DAYS,
        ("warnings", "metadata"),
    ),
    "validation_artifacts": (
        ("evaluated_at",),
        COMPACT_PAYLOAD_RETENTION_DAYS,
        ("result_input", "evidence_ids", "metadata"),
    ),
}

_COMPACT_CLASSIFIED_TABLES = (
    COMPACT_FOREVER_TABLES
    | COMPACT_REFERENCED_CATALOG_TABLES
    | COMPACT_CURRENT_TABLES
    | frozenset(COMPACT_RECENT_RULES)
    | COMPACT_DERIVED_ONLY_TABLES
)
if _COMPACT_CLASSIFIED_TABLES != DOMAIN_TABLES:  # pragma: no cover - invariant
    raise RuntimeError("Every domain table must have exactly one compact retention policy")
if (
    len(COMPACT_FOREVER_TABLES)
    + len(COMPACT_REFERENCED_CATALOG_TABLES)
    + len(COMPACT_CURRENT_TABLES)
    + len(COMPACT_RECENT_RULES)
    + len(COMPACT_DERIVED_ONLY_TABLES)
    != len(DOMAIN_TABLES)
):  # pragma: no cover - invariant
    raise RuntimeError("Compact retention policy groups must not overlap")


class MigrationError(RuntimeError):
    """Base class for safe, user-actionable migration errors."""


class ContractError(MigrationError):
    """Raised when source or target schema violates the migration contract."""


class SafetyError(MigrationError):
    """Raised when a destructive or ambiguous operation is not authorized."""


@dataclass(frozen=True)
class ColumnInfo:
    name: str
    data_type: str
    native_type: str
    nullable: bool
    ordinal: int
    default_expression: str | None = None


@dataclass(frozen=True)
class ForeignKeyInfo:
    child_table: str
    child_column: str
    parent_table: str
    parent_column: str
    constraint_name: str = ""
    ordinal: int = 1


@dataclass(frozen=True)
class TableInfo:
    name: str
    columns: tuple[ColumnInfo, ...]
    primary_key: tuple[str, ...]
    foreign_keys: tuple[ForeignKeyInfo, ...]


@dataclass
class ProfilePlan:
    name: str
    as_of: dt.datetime | None
    selected_keys: dict[str, set[tuple[Any, ...]]] | None
    seed_counts: dict[str, int]
    closure_iterations: int
    closure_added_rows: int
    fk_violations: list[dict[str, Any]]
    table_estimates: list[dict[str, Any]]
    source_rows: int
    selected_rows: int
    estimated_source_bytes: int
    estimated_target_bytes: int
    durable_keys: dict[str, set[tuple[Any, ...]]] | None = None
    protected_column_keys: dict[str, set[tuple[Any, ...]]] = field(
        default_factory=dict
    )
    reference_count_mismatches: list[dict[str, Any]] = field(default_factory=list)
    json_reference_stats: list[dict[str, Any]] = field(default_factory=list)
    json_reference_violations: list[dict[str, Any]] = field(default_factory=list)

    @property
    def fk_closed(self) -> bool:
        return not self.fk_violations

    @property
    def within_compact_budget(self) -> bool:
        return (
            self.name != PROFILE_COMPACT_FREE
            or self.estimated_target_bytes <= COMPACT_FREE_MAX_ESTIMATED_BYTES
        )

    @property
    def reference_profile_matches(self) -> bool:
        return not self.reference_count_mismatches

    @property
    def json_references_closed(self) -> bool:
        return not self.json_reference_violations


_DATABASE_URL_RE = re.compile(
    r"(?i)\b(?:mysql(?:\+[a-z0-9_]+)?|postgres(?:ql)?(?:\+[a-z0-9_]+)?)://[^\s\"']+"
)
_PASSWORD_ASSIGNMENT_RE = re.compile(
    r"(?i)(\b(?:password|passwd|pwd)\s*[=:]\s*)([^\s,;\"']+|\"[^\"]*\"|'[^']*')"
)
_JSON_PASSWORD_RE = re.compile(
    r'(?i)([\"\'](?:password|passwd|pwd)[\"\']\s*:\s*[\"\'])(.*?)([\"\'])'
)


def _dsn_secret_values(dsn: str | None) -> set[str]:
    if not dsn:
        return set()
    values = {dsn}
    try:
        parsed = urlparse(dsn)
        if parsed.password:
            values.add(parsed.password)
            values.add(unquote(parsed.password))
    except ValueError:
        pass
    return {value for value in values if value}


def redact_secrets(text: Any, secrets: Iterable[str] = ()) -> str:
    """Return text with DSNs and password-like values irreversibly removed."""

    redacted = str(text)
    for secret in sorted({value for value in secrets if value}, key=len, reverse=True):
        redacted = redacted.replace(secret, "[REDACTED]")
    redacted = _DATABASE_URL_RE.sub("[REDACTED_DSN]", redacted)
    redacted = _PASSWORD_ASSIGNMENT_RE.sub(r"\1[REDACTED]", redacted)
    redacted = _JSON_PASSWORD_RE.sub(r"\1[REDACTED]\3", redacted)
    return redacted


def sanitize_structure(value: Any, secrets: Iterable[str] = ()) -> Any:
    """Recursively sanitize strings before serializing an output document."""

    if isinstance(value, str):
        return redact_secrets(value, secrets)
    if isinstance(value, Mapping):
        return {
            redact_secrets(key, secrets): sanitize_structure(item, secrets)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [sanitize_structure(item, secrets) for item in value]
    return value


def safe_exception_message(error: BaseException, secrets: Iterable[str] = ()) -> str:
    """Expose only messages authored by this utility, never connector row context."""

    if isinstance(error, MigrationError):
        return redact_secrets(error, secrets)
    if isinstance(error, KeyboardInterrupt):
        return "Operation interrupted before completion"
    return (
        f"{type(error).__name__} during a database operation; "
        "connector details were suppressed to protect credentials and row data"
    )


def emit_json(document: Mapping[str, Any], secrets: Iterable[str] = ()) -> None:
    safe = sanitize_structure(document, secrets)
    print(json.dumps(safe, ensure_ascii=False, sort_keys=True, indent=2))


def quote_identifier(identifier: str) -> str:
    """Quote an SQL identifier discovered from an authoritative catalog."""

    if "\x00" in identifier:
        raise ContractError("SQL identifier contains a NUL byte")
    return '"' + identifier.replace('"', '""') + '"'


def quote_mysql_identifier(identifier: str) -> str:
    if "\x00" in identifier:
        raise ContractError("SQL identifier contains a NUL byte")
    return "`" + identifier.replace("`", "``") + "`"


def topological_order(
    tables: Iterable[str], dependencies: Mapping[str, Iterable[str]]
) -> list[str]:
    """Return a deterministic parent-before-child topological table order.

    Self-referencing foreign keys do not affect table ordering.  A real cycle is
    rejected instead of silently disabling PostgreSQL constraints.
    """

    table_set = set(tables)
    remaining: dict[str, set[str]] = {
        table: {
            parent
            for parent in dependencies.get(table, ())
            if parent in table_set and parent != table
        }
        for table in table_set
    }
    ordered: list[str] = []

    while remaining:
        ready = sorted(table for table, parents in remaining.items() if not parents)
        if not ready:
            cycle_tables = sorted(remaining)
            raise ContractError(
                "Foreign-key cycle prevents a safe topological copy: "
                + ", ".join(cycle_tables)
            )
        ordered.extend(ready)
        for table in ready:
            del remaining[table]
        ready_set = set(ready)
        for parents in remaining.values():
            parents.difference_update(ready_set)

    return ordered


def dependencies_from_schema(schema: Mapping[str, TableInfo]) -> dict[str, set[str]]:
    return {
        table_name: {
            foreign_key.parent_table
            for foreign_key in table.foreign_keys
            if foreign_key.parent_table in schema
        }
        for table_name, table in schema.items()
    }


def _normalize_decimal(value: decimal.Decimal | int | float | str) -> str:
    number = value if isinstance(value, decimal.Decimal) else decimal.Decimal(str(value))
    if not number.is_finite():
        raise ContractError("Non-finite numeric value cannot be canonicalized")
    if number == 0:
        return "0"
    normalized = format(number.normalize(), "f")
    if "." in normalized:
        normalized = normalized.rstrip("0").rstrip(".")
    return normalized


def _normalize_datetime(value: dt.datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    else:
        value = value.astimezone(dt.timezone.utc)
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _json_ready(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, (decimal.Decimal, int, float)) and not isinstance(value, bool):
        return {"$number": _normalize_decimal(value)}
    if isinstance(value, dt.datetime):
        return {"$datetime": _normalize_datetime(value)}
    if isinstance(value, dt.date):
        return {"$date": value.isoformat()}
    if isinstance(value, dt.time):
        return {"$time": value.isoformat(timespec="microseconds")}
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"$bytes": bytes(value).hex()}
    if isinstance(value, Mapping):
        return {str(key): _json_ready(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [_json_ready(item) for item in value]
    raise ContractError(f"Unsupported JSON value type: {type(value).__name__}")


def _is_json_column(column: ColumnInfo) -> bool:
    return column.data_type.lower() in {"json", "jsonb"} or column.native_type.lower() in {
        "json",
        "jsonb",
    }


def _is_boolean_column(column: ColumnInfo) -> bool:
    return column.data_type.lower() == "boolean" or column.native_type.lower() == "bool"


def _is_numeric_column(column: ColumnInfo) -> bool:
    return column.data_type.lower() in {
        "decimal",
        "double precision",
        "numeric",
        "real",
    } or column.native_type.lower() in {"decimal", "float4", "float8", "numeric"}


def _parse_json_value(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray, memoryview)):
        value = bytes(value).decode("utf-8")
    if isinstance(value, str):
        return json.loads(value, parse_float=decimal.Decimal, parse_int=decimal.Decimal)
    return value


def canonicalize_value(value: Any, column: ColumnInfo) -> Any:
    """Normalize one value so MySQL and PostgreSQL yield the same hash input."""

    if value is None:
        return None
    if _is_json_column(column):
        return {"$json": _json_ready(_parse_json_value(value))}
    if _is_boolean_column(column):
        if isinstance(value, (bytes, bytearray, memoryview)):
            raw = bytes(value)
            value = int.from_bytes(raw, "big") if raw else 0
        if isinstance(value, str):
            value = value.strip().lower() in {"1", "true", "t", "yes", "y"}
        return {"$bool": bool(value)}
    if isinstance(value, dt.datetime):
        return {"$datetime": _normalize_datetime(value)}
    if isinstance(value, dt.date):
        return {"$date": value.isoformat()}
    if isinstance(value, dt.time):
        return {"$time": value.isoformat(timespec="microseconds")}
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"$bytes": bytes(value).hex()}
    if _is_numeric_column(column) and isinstance(
        value, (decimal.Decimal, int, float, str)
    ):
        return {"$number": _normalize_decimal(value)}
    if isinstance(value, bool):
        return {"$bool": value}
    if isinstance(value, decimal.Decimal):
        return {"$number": _normalize_decimal(value)}
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ContractError("Non-finite float cannot be canonicalized")
        return {"$number": _normalize_decimal(value)}
    if isinstance(value, (str, int)):
        return value
    raise ContractError(f"Unsupported value type: {type(value).__name__}")


def canonical_row_bytes(row: Sequence[Any], columns: Sequence[ColumnInfo]) -> bytes:
    if len(row) != len(columns):
        raise ContractError("Row width does not match the schema column count")
    normalized = [canonicalize_value(value, column) for value, column in zip(row, columns)]
    return json.dumps(
        normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _mysql_connection_options(dsn: str) -> dict[str, Any]:
    parsed = urlparse(dsn)
    if parsed.scheme.lower() not in {"mysql", "mysql+mysqlconnector"}:
        raise ContractError("SOURCE_DATABASE_URL must use the mysql:// scheme")
    database = unquote(parsed.path.lstrip("/"))
    if not database:
        raise ContractError("The MySQL source URL must name a database")
    if database != EXPECTED_SOURCE_DATABASE:
        raise SafetyError(f"Refusing source database; expected {EXPECTED_SOURCE_DATABASE!r}")

    query = {key.lower(): values[-1] for key, values in parse_qs(parsed.query).items()}
    options: dict[str, Any] = {
        "host": parsed.hostname,
        "port": parsed.port or 3306,
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "database": database,
        "autocommit": False,
        "use_pure": True,
        "connection_timeout": int(query.get("connect_timeout", "20")),
    }
    ssl_mode = query.get("ssl-mode", query.get("sslmode", "")).lower()
    ssl_accept = query.get("sslaccept", "").lower()
    if ssl_mode in {"required", "require", "verify-ca", "verify-full"}:
        options["ssl_disabled"] = False
    if ssl_mode in {"verify-ca", "verify-full"}:
        options["ssl_verify_cert"] = True
    if ssl_mode == "verify-full":
        options["ssl_verify_identity"] = True
    if ssl_accept == "accept_invalid_certs":
        # Prisma's compatibility mode still requests encrypted transport but
        # does not validate the server certificate.  mysql.connector uses
        # explicit booleans for the same behavior; never forward sslaccept.
        options["ssl_disabled"] = False
        options["ssl_verify_cert"] = False
        options["ssl_verify_identity"] = False
    elif ssl_accept == "strict":
        options["ssl_disabled"] = False
        options["ssl_verify_cert"] = True
        options["ssl_verify_identity"] = True
    elif ssl_accept:
        raise ContractError("Unsupported Prisma sslaccept value in source URL")
    if "ssl_ca" in query:
        options["ssl_ca"] = query["ssl_ca"]
    return options


def connect_mysql(dsn: str) -> Any:
    try:
        import mysql.connector  # type: ignore[import-not-found]
    except ImportError as error:  # pragma: no cover - dependency varies by host
        raise MigrationError(
            "mysql-connector-python is required; install it in an isolated Python environment"
        ) from error
    return mysql.connector.connect(**_mysql_connection_options(dsn))


def connect_postgres(dsn: str) -> Any:
    parsed = urlparse(dsn)
    if parsed.scheme.lower() not in {"postgres", "postgresql"}:
        raise ContractError("TARGET_DATABASE_URL must use postgres:// or postgresql://")
    try:
        import psycopg2  # type: ignore[import-not-found]
        from psycopg2.extras import (  # type: ignore[import-not-found]
            register_default_json,
            register_default_jsonb,
        )
    except ImportError as error:  # pragma: no cover - dependency varies by host
        raise MigrationError(
            "psycopg2 is required; install psycopg2-binary in an isolated Python environment"
        ) from error
    connection = psycopg2.connect(dsn, application_name="gana-v9-mysql-to-supabase")
    decimal_json_loader = lambda payload: json.loads(  # noqa: E731
        payload, parse_float=decimal.Decimal, parse_int=decimal.Decimal
    )
    register_default_json(connection, loads=decimal_json_loader)
    register_default_jsonb(connection, loads=decimal_json_loader)
    return connection


def start_mysql_consistent_snapshot(connection: Any) -> None:
    """Pin all source reads to one read-only, repeatable snapshot."""

    cursor = connection.cursor()
    try:
        # mysql-connector returns DATETIME values without tzinfo.  Pinning the
        # session to UTC before the snapshot makes the later naive->UTC COPY
        # adaptation explicit and prevents a host/session timezone shift.
        cursor.execute("SET SESSION time_zone = '+00:00'")
        cursor.execute("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        cursor.execute("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY")
    finally:
        cursor.close()


def _make_schema(
    table_names: Iterable[str],
    column_rows: Iterable[Sequence[Any]],
    primary_key_rows: Iterable[Sequence[Any]],
    foreign_key_rows: Iterable[Sequence[Any]],
) -> dict[str, TableInfo]:
    columns: dict[str, list[ColumnInfo]] = {name: [] for name in table_names}
    primary_keys: dict[str, list[tuple[int, str]]] = {name: [] for name in columns}
    foreign_keys: dict[str, list[ForeignKeyInfo]] = {name: [] for name in columns}

    for column_row in column_rows:
        if len(column_row) == 6:
            table, name, data_type, native_type, nullable, ordinal = column_row
            default_expression = None
        else:
            (
                table,
                name,
                data_type,
                native_type,
                nullable,
                ordinal,
                default_expression,
            ) = column_row
        if table in columns:
            columns[table].append(
                ColumnInfo(
                    name=str(name),
                    data_type=str(data_type),
                    native_type=str(native_type),
                    nullable=str(nullable).upper() == "YES",
                    ordinal=int(ordinal),
                    default_expression=(
                        str(default_expression) if default_expression is not None else None
                    ),
                )
            )
    for table, name, ordinal in primary_key_rows:
        if table in primary_keys:
            primary_keys[table].append((int(ordinal), str(name)))
    for (
        child_table,
        child_column,
        parent_table,
        parent_column,
        constraint_name,
        ordinal,
    ) in foreign_key_rows:
        if child_table in foreign_keys:
            foreign_keys[child_table].append(
                ForeignKeyInfo(
                    child_table=str(child_table),
                    child_column=str(child_column),
                    parent_table=str(parent_table),
                    parent_column=str(parent_column),
                    constraint_name=str(constraint_name),
                    ordinal=int(ordinal),
                )
            )

    return {
        table: TableInfo(
            name=table,
            columns=tuple(sorted(columns[table], key=lambda item: item.ordinal)),
            primary_key=tuple(name for _, name in sorted(primary_keys[table])),
            foreign_keys=tuple(
                sorted(
                    foreign_keys[table],
                    key=lambda item: (item.constraint_name, item.ordinal),
                )
            ),
        )
        for table in sorted(columns)
    }


def discover_mysql_schema(connection: Any) -> dict[str, TableInfo]:
    cursor = connection.cursor(buffered=True)
    try:
        cursor.execute("SELECT DATABASE()")
        row = cursor.fetchone()
        active_database = row[0] if row else None
        if active_database != EXPECTED_SOURCE_DATABASE:
            raise SafetyError(
                f"Connected source is not {EXPECTED_SOURCE_DATABASE!r}; refusing to continue"
            )

        cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """,
            (EXPECTED_SOURCE_DATABASE,),
        )
        table_names = [str(item[0]) for item in cursor.fetchall() if item[0] not in EXCLUDED_TABLES]

        cursor.execute(
            """
            SELECT table_name, column_name, data_type, column_type, is_nullable,
                   ordinal_position, column_default
            FROM information_schema.columns
            WHERE table_schema = %s
            ORDER BY table_name, ordinal_position
            """,
            (EXPECTED_SOURCE_DATABASE,),
        )
        column_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT table_name, column_name, seq_in_index
            FROM information_schema.statistics
            WHERE table_schema = %s AND index_name = 'PRIMARY'
            ORDER BY table_name, seq_in_index
            """,
            (EXPECTED_SOURCE_DATABASE,),
        )
        primary_key_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT table_name, column_name, referenced_table_name, referenced_column_name,
                   constraint_name, ordinal_position
            FROM information_schema.key_column_usage
            WHERE table_schema = %s AND referenced_table_name IS NOT NULL
            ORDER BY table_name, constraint_name, ordinal_position
            """,
            (EXPECTED_SOURCE_DATABASE,),
        )
        foreign_key_rows = cursor.fetchall()
    finally:
        cursor.close()

    return _make_schema(table_names, column_rows, primary_key_rows, foreign_key_rows)


def discover_postgres_schema(connection: Any, schema_name: str) -> dict[str, TableInfo]:
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """,
            (schema_name,),
        )
        table_names = [str(item[0]) for item in cursor.fetchall() if item[0] not in EXCLUDED_TABLES]

        cursor.execute(
            """
            SELECT table_name, column_name, data_type, udt_name, is_nullable,
                   ordinal_position, column_default
            FROM information_schema.columns
            WHERE table_schema = %s
            ORDER BY table_name, ordinal_position
            """,
            (schema_name,),
        )
        column_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT kcu.table_name, kcu.column_name, kcu.ordinal_position
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_schema = kcu.constraint_schema
             AND tc.constraint_name = kcu.constraint_name
            WHERE tc.constraint_schema = %s AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY kcu.table_name, kcu.ordinal_position
            """,
            (schema_name,),
        )
        primary_key_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT kcu.table_name, kcu.column_name,
                   parent_kcu.table_name AS referenced_table_name,
                   parent_kcu.column_name AS referenced_column_name,
                   kcu.constraint_name, kcu.ordinal_position
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_schema = kcu.constraint_schema
             AND tc.constraint_name = kcu.constraint_name
            JOIN information_schema.referential_constraints AS rc
              ON tc.constraint_schema = rc.constraint_schema
             AND tc.constraint_name = rc.constraint_name
            JOIN information_schema.key_column_usage AS parent_kcu
              ON rc.unique_constraint_schema = parent_kcu.constraint_schema
             AND rc.unique_constraint_name = parent_kcu.constraint_name
             AND kcu.position_in_unique_constraint = parent_kcu.ordinal_position
            WHERE tc.constraint_schema = %s AND tc.constraint_type = 'FOREIGN KEY'
            ORDER BY kcu.table_name, kcu.constraint_name, kcu.ordinal_position
            """,
            (schema_name,),
        )
        foreign_key_rows = cursor.fetchall()
    finally:
        cursor.close()

    return _make_schema(table_names, column_rows, primary_key_rows, foreign_key_rows)


def schema_set_report(
    source_schema: Mapping[str, TableInfo], target_schema: Mapping[str, TableInfo]
) -> dict[str, Any]:
    source = set(source_schema)
    target = set(target_schema)
    expected = set(DOMAIN_TABLES)
    target_domain = target & expected
    target_auxiliary = target & set(TARGET_AUXILIARY_TABLES)
    return {
        "expectedCount": len(expected),
        "allowedTargetAuxiliaryCount": len(TARGET_AUXILIARY_TABLES),
        "sourceCount": len(source),
        "targetCount": len(target),
        "sourceMissingExpected": sorted(expected - source),
        "sourceUnexpected": sorted(source - expected),
        "targetMissingExpected": sorted(expected - target_domain),
        "targetUnexpected": sorted(
            target - expected - set(TARGET_AUXILIARY_TABLES)
        ),
        "targetAuxiliaryTables": sorted(target_auxiliary),
        "sourceOnly": sorted(source - target_domain),
        "targetOnly": sorted(target_domain - source),
    }


def column_contract_report(
    source_schema: Mapping[str, TableInfo], target_schema: Mapping[str, TableInfo]
) -> dict[str, Any]:
    mismatches: list[dict[str, Any]] = []
    allowed_extensions: list[dict[str, Any]] = []
    for table_name in sorted(set(source_schema) & set(target_schema) & set(DOMAIN_TABLES)):
        source_table = source_schema[table_name]
        target_table = target_schema[table_name]
        source_columns = {column.name for column in source_table.columns}
        target_columns = {column.name for column in target_table.columns}
        target_columns_by_name = {column.name: column for column in target_table.columns}
        source_only_columns = source_columns - target_columns
        target_only_columns = target_columns - source_columns
        allowed_target_only = ALLOWED_TARGET_ONLY_COLUMNS.get(table_name, frozenset())
        unsupported_target_only = target_only_columns - allowed_target_only
        unfillable_target_only = {
            column_name
            for column_name in target_only_columns & allowed_target_only
            if not target_columns_by_name[column_name].nullable
            and target_columns_by_name[column_name].default_expression is None
        }
        tolerated = target_only_columns & allowed_target_only
        if tolerated:
            allowed_extensions.append(
                {
                    "table": table_name,
                    "columns": sorted(tolerated),
                    "fill": {
                        column_name: (
                            "DEFAULT"
                            if target_columns_by_name[column_name].default_expression is not None
                            else "NULL"
                        )
                        for column_name in sorted(tolerated)
                    },
                }
            )
        source_foreign_keys = {
            (
                foreign_key.child_column,
                foreign_key.parent_table,
                foreign_key.parent_column,
            )
            for foreign_key in source_table.foreign_keys
        }
        target_foreign_keys = {
            (
                foreign_key.child_column,
                foreign_key.parent_table,
                foreign_key.parent_column,
            )
            for foreign_key in target_table.foreign_keys
        }
        if (
            source_only_columns
            or unsupported_target_only
            or unfillable_target_only
            or source_table.primary_key != target_table.primary_key
            or not source_table.primary_key
            or source_foreign_keys != target_foreign_keys
        ):
            mismatches.append(
                {
                    "table": table_name,
                    "sourceOnlyColumns": sorted(source_only_columns),
                    "targetOnlyColumns": sorted(target_only_columns),
                    "allowedTargetOnlyColumns": sorted(
                        target_only_columns & allowed_target_only
                    ),
                    "unsupportedTargetOnlyColumns": sorted(unsupported_target_only),
                    "unfillableTargetOnlyColumns": sorted(unfillable_target_only),
                    "sourcePrimaryKey": list(source_table.primary_key),
                    "targetPrimaryKey": list(target_table.primary_key),
                    "sourceOnlyForeignKeys": [
                        list(item) for item in sorted(source_foreign_keys - target_foreign_keys)
                    ],
                    "targetOnlyForeignKeys": [
                        list(item) for item in sorted(target_foreign_keys - source_foreign_keys)
                    ],
                }
            )
    return {
        "mismatchCount": len(mismatches),
        "mismatches": mismatches,
        "allowedDestinationExtensions": allowed_extensions,
    }


def assert_schema_contract(
    source_schema: Mapping[str, TableInfo], target_schema: Mapping[str, TableInfo]
) -> None:
    set_report = schema_set_report(source_schema, target_schema)
    if any(
        set_report[key]
        for key in (
            "sourceMissingExpected",
            "sourceUnexpected",
            "targetMissingExpected",
            "targetUnexpected",
            "sourceOnly",
            "targetOnly",
        )
    ):
        raise ContractError("Source and target table sets do not match the 33-table contract")
    column_report = column_contract_report(source_schema, target_schema)
    if column_report["mismatchCount"]:
        raise ContractError(
            "Source and target column, primary-key, or foreign-key contracts differ"
        )


def parse_as_of(raw_value: str | None, profile_name: str) -> dt.datetime | None:
    if profile_name not in PROFILE_NAMES:
        raise ContractError(f"Unsupported migration profile: {profile_name}")
    if raw_value is None:
        if profile_name == PROFILE_COMPACT_FREE:
            raise ContractError("--as-of is required for the compact-free profile")
        return None
    normalized = raw_value[:-1] + "+00:00" if raw_value.endswith("Z") else raw_value
    try:
        value = dt.datetime.fromisoformat(normalized)
    except ValueError as error:
        raise ContractError("--as-of must be an ISO-8601 UTC date-time") from error
    if value.tzinfo is None or value.utcoffset() != dt.timedelta(0):
        raise ContractError("--as-of must include the UTC offset Z or +00:00")
    return value.astimezone(dt.timezone.utc)


def _format_as_of(value: dt.datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _freeze_key_value(value: Any) -> Any:
    if isinstance(value, (bytearray, memoryview)):
        return bytes(value)
    return value


def _freeze_key(values: Sequence[Any]) -> tuple[Any, ...]:
    return tuple(_freeze_key_value(value) for value in values)


def _key_sort_value(key: tuple[Any, ...]) -> tuple[tuple[str, str], ...]:
    return tuple((type(value).__name__, repr(value)) for value in key)


def _key_chunks(
    keys: Iterable[tuple[Any, ...]], width: int, max_parameters: int = 4_000
) -> Iterator[list[tuple[Any, ...]]]:
    if width < 1:
        raise ContractError("A profile key must contain at least one column")
    chunk_size = max(1, max_parameters // width)
    try:
        ordered = sorted(keys)
    except TypeError:
        ordered = sorted(keys, key=_key_sort_value)
    for offset in range(0, len(ordered), chunk_size):
        yield ordered[offset : offset + chunk_size]


def _mysql_key_predicate(
    columns: Sequence[str], keys: Sequence[tuple[Any, ...]]
) -> tuple[str, list[Any]]:
    if not keys:
        return "0 = 1", []
    if any(len(key) != len(columns) for key in keys):
        raise ContractError("Profile key width does not match its filter columns")
    quoted_columns = [quote_mysql_identifier(column) for column in columns]
    params = [value for key in keys for value in key]
    if len(columns) == 1:
        placeholders = ", ".join("%s" for _ in keys)
        return f"{quoted_columns[0]} IN ({placeholders})", params
    row_columns = "(" + ", ".join(quoted_columns) + ")"
    row_placeholder = "(" + ", ".join("%s" for _ in columns) + ")"
    return f"{row_columns} IN ({', '.join(row_placeholder for _ in keys)})", params


def _postgres_key_predicate(
    columns: Sequence[str], keys: Sequence[tuple[Any, ...]]
) -> tuple[str, list[Any]]:
    if not keys:
        return "FALSE", []
    if any(len(key) != len(columns) for key in keys):
        raise ContractError("Profile key width does not match its filter columns")
    quoted_columns = [quote_identifier(column) for column in columns]
    params = [value for key in keys for value in key]
    if len(columns) == 1:
        placeholders = ", ".join("%s" for _ in keys)
        return f"{quoted_columns[0]} IN ({placeholders})", params
    row_columns = "(" + ", ".join(quoted_columns) + ")"
    row_placeholder = "(" + ", ".join("%s" for _ in columns) + ")"
    return f"{row_columns} IN ({', '.join(row_placeholder for _ in keys)})", params


def _iter_mysql_rows_for_keys(
    connection: Any,
    table: TableInfo,
    select_columns: Sequence[str],
    filter_columns: Sequence[str],
    filter_keys: Iterable[tuple[Any, ...]],
    fetch_size: int,
) -> Iterator[tuple[Any, ...]]:
    selected_sql = ", ".join(quote_mysql_identifier(name) for name in select_columns)
    order_sql = ", ".join(
        quote_mysql_identifier(name) for name in table.primary_key
    )
    for key_chunk in _key_chunks(filter_keys, len(filter_columns)):
        where_sql, params = _mysql_key_predicate(filter_columns, key_chunk)
        cursor = connection.cursor(buffered=False)
        try:
            cursor.execute(
                f"SELECT {selected_sql} FROM {quote_mysql_identifier(table.name)} "
                f"WHERE {where_sql} ORDER BY {order_sql}",
                params,
            )
            while True:
                rows = cursor.fetchmany(fetch_size)
                if not rows:
                    break
                for row in rows:
                    yield tuple(row)
        finally:
            cursor.close()


def _select_source_keys(
    connection: Any,
    table: TableInfo,
    batch_size: int,
    where_sql: str | None = None,
    params: Sequence[Any] = (),
) -> set[tuple[Any, ...]]:
    if not table.primary_key:
        raise ContractError(f"Table {table.name!r} has no primary key for profiling")
    selected_sql = ", ".join(
        quote_mysql_identifier(name) for name in table.primary_key
    )
    sql = f"SELECT {selected_sql} FROM {quote_mysql_identifier(table.name)}"
    if where_sql:
        sql += " WHERE " + where_sql
    sql += " ORDER BY " + selected_sql
    cursor = connection.cursor(buffered=False)
    keys: set[tuple[Any, ...]] = set()
    try:
        cursor.execute(sql, tuple(params))
        while True:
            rows = cursor.fetchmany(batch_size)
            if not rows:
                break
            keys.update(_freeze_key(row) for row in rows)
    finally:
        cursor.close()
    return keys


def _select_recent_deduped_keys(
    connection: Any,
    table: TableInfo,
    partition_columns: Sequence[str],
    timestamp_column: str,
    cutoff: dt.datetime,
    as_of: dt.datetime,
    batch_size: int,
) -> set[tuple[Any, ...]]:
    available = {column.name for column in table.columns}
    required = set(partition_columns) | set(table.primary_key) | {timestamp_column}
    if not required.issubset(available):
        raise ContractError(
            f"Exact dedupe columns missing from {table.name!r}: "
            + ", ".join(sorted(required - available))
        )
    pk_sql = ", ".join(quote_mysql_identifier(name) for name in table.primary_key)
    partition_sql = ", ".join(
        quote_mysql_identifier(name) for name in partition_columns
    )
    ordering = ", ".join(
        [f"{quote_mysql_identifier(timestamp_column)} DESC"]
        + [f"{quote_mysql_identifier(name)} DESC" for name in table.primary_key]
    )
    cursor = connection.cursor(buffered=False)
    keys: set[tuple[Any, ...]] = set()
    try:
        cursor.execute(
            f"SELECT {pk_sql} FROM ("
            f"SELECT {pk_sql}, ROW_NUMBER() OVER ("
            f"PARTITION BY {partition_sql} ORDER BY {ordering}"
            f") AS profile_rank FROM {quote_mysql_identifier(table.name)} "
            f"WHERE {quote_mysql_identifier(timestamp_column)} >= %s "
            f"AND {quote_mysql_identifier(timestamp_column)} <= %s"
            f") AS compact_ranked WHERE profile_rank = 1 ORDER BY {pk_sql}",
            (cutoff, as_of),
        )
        while True:
            rows = cursor.fetchmany(batch_size)
            if not rows:
                break
            keys.update(_freeze_key(row) for row in rows)
    finally:
        cursor.close()
    return keys


def _select_deduped_odds_quote_keys(
    connection: Any,
    table: TableInfo,
    snapshot_keys: set[tuple[Any, ...]],
    batch_size: int,
) -> set[tuple[Any, ...]]:
    """Select one exact business quote per retained snapshot/content tuple.

    A prediction can still add its precise quote key later through parent
    closure, even when that key was an otherwise duplicate observation.  This
    helper only removes duplicate raw siblings; it never crosses snapshots.
    """

    if not snapshot_keys:
        return set()
    if any(len(key) != 1 for key in snapshot_keys):
        raise ContractError("Odds snapshot keys must contain exactly one column")
    available = {column.name for column in table.columns}
    required = (
        set(table.primary_key)
        | set(COMPACT_ODDS_QUOTE_DEDUPE_PARTITION)
        | {"snapshot_id", "captured_at"}
    )
    if not required.issubset(available):
        raise ContractError(
            "Exact quote dedupe columns missing from 'odds_quotes': "
            + ", ".join(sorted(required - available))
        )

    pk_sql = ", ".join(quote_mysql_identifier(name) for name in table.primary_key)
    partition_sql = ", ".join(
        quote_mysql_identifier(name)
        for name in COMPACT_ODDS_QUOTE_DEDUPE_PARTITION
    )
    ordering = ", ".join(
        [f"{quote_mysql_identifier('captured_at')} DESC"]
        + [f"{quote_mysql_identifier(name)} DESC" for name in table.primary_key]
    )
    keys: set[tuple[Any, ...]] = set()
    for snapshot_chunk in _key_chunks(snapshot_keys, 1):
        where_sql, params = _mysql_key_predicate(
            ("snapshot_id",), snapshot_chunk
        )
        cursor = connection.cursor(buffered=False)
        try:
            cursor.execute(
                f"SELECT {pk_sql} FROM ("
                f"SELECT {pk_sql}, ROW_NUMBER() OVER ("
                f"PARTITION BY {partition_sql} ORDER BY {ordering}"
                f") AS profile_rank FROM {quote_mysql_identifier(table.name)} "
                f"WHERE {where_sql}"
                f") AS compact_ranked WHERE profile_rank = 1 ORDER BY {pk_sql}",
                tuple(params),
            )
            while True:
                rows = cursor.fetchmany(batch_size)
                if not rows:
                    break
                keys.update(_freeze_key(row) for row in rows)
        finally:
            cursor.close()
    return keys


def _foreign_key_groups(table: TableInfo) -> list[tuple[ForeignKeyInfo, ...]]:
    grouped: dict[tuple[str, str], list[ForeignKeyInfo]] = defaultdict(list)
    for foreign_key in table.foreign_keys:
        grouped[(foreign_key.constraint_name, foreign_key.parent_table)].append(foreign_key)
    return [
        tuple(sorted(items, key=lambda item: item.ordinal))
        for _, items in sorted(grouped.items())
    ]


def _assert_fk_references_parent_pk(
    group: Sequence[ForeignKeyInfo], source_schema: Mapping[str, TableInfo]
) -> None:
    parent = source_schema[group[0].parent_table]
    referenced_columns = {item.parent_column for item in group}
    if referenced_columns != set(parent.primary_key):
        raise ContractError(
            "compact-free cannot safely close a foreign key that does not reference "
            f"the full primary key: {group[0].child_table}.{group[0].constraint_name}"
        )


def _compact_fk_can_be_nulled(
    group: Sequence[ForeignKeyInfo], source_schema: Mapping[str, TableInfo]
) -> bool:
    if group[0].parent_table not in COMPACT_NULLABLE_PRUNABLE_PARENT_TABLES:
        return False
    if (
        group[0].child_table,
        group[0].parent_table,
    ) in COMPACT_PRESERVE_OPTIONAL_FK_EDGES:
        return False
    child_columns = {
        column.name: column
        for column in source_schema[group[0].child_table].columns
    }
    return all(child_columns[item.child_column].nullable for item in group)


def _add_parent_closure(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    retained: dict[str, set[tuple[Any, ...]]],
    processed: dict[str, set[tuple[Any, ...]]],
    batch_size: int,
    prune_nullable_raw: bool,
) -> int:
    added = 0
    for child_name in sorted(source_schema):
        child = source_schema[child_name]
        groups = _foreign_key_groups(child)
        new_child_keys = retained[child_name] - processed[child_name]
        if not new_child_keys:
            continue
        processed[child_name].update(new_child_keys)
        if not groups:
            continue
        fk_columns = sorted({item.child_column for group in groups for item in group})
        select_columns = list(child.primary_key) + fk_columns
        column_indexes = {name: index for index, name in enumerate(select_columns)}
        for row in _iter_mysql_rows_for_keys(
            connection,
            child,
            select_columns,
            child.primary_key,
            new_child_keys,
            batch_size,
        ):
            for group in groups:
                _assert_fk_references_parent_pk(group, source_schema)
                by_parent_column = {
                    item.parent_column: row[column_indexes[item.child_column]]
                    for item in group
                }
                if any(value is None for value in by_parent_column.values()):
                    continue
                parent = source_schema[group[0].parent_table]
                parent_key = _freeze_key(
                    [by_parent_column[column] for column in parent.primary_key]
                )
                if (
                    prune_nullable_raw
                    and
                    _compact_fk_can_be_nulled(group, source_schema)
                    and parent_key not in retained[parent.name]
                ):
                    continue
                if parent_key not in retained[parent.name]:
                    retained[parent.name].add(parent_key)
                    added += 1
    return added


def _add_descendant_closure(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    retained: dict[str, set[tuple[Any, ...]]],
    processed: dict[tuple[str, str, str], set[tuple[Any, ...]]],
    batch_size: int,
    relations: Iterable[tuple[str, str]],
) -> int:
    added = 0
    for parent_name, child_name in sorted(relations):
        parent = source_schema[parent_name]
        child = source_schema[child_name]
        matching_groups = [
            group
            for group in _foreign_key_groups(child)
            if group[0].parent_table == parent_name
        ]
        if not matching_groups:
            raise ContractError(
                f"Required compact lineage relation is missing: {parent_name} -> {child_name}"
            )
        for group in matching_groups:
            _assert_fk_references_parent_pk(group, source_schema)
            relation_key = (parent_name, child_name, group[0].constraint_name)
            new_parent_keys = retained[parent_name] - processed[relation_key]
            if not new_parent_keys:
                continue
            processed[relation_key].update(new_parent_keys)
            child_by_parent = {item.parent_column: item.child_column for item in group}
            child_filter_columns = [
                child_by_parent[column] for column in parent.primary_key
            ]
            for row in _iter_mysql_rows_for_keys(
                connection,
                child,
                child.primary_key,
                child_filter_columns,
                new_parent_keys,
                batch_size,
            ):
                child_key = _freeze_key(row[: len(child.primary_key)])
                if child_key not in retained[child_name]:
                    retained[child_name].add(child_key)
                    added += 1
    return added


def _json_reference_rules_for_child(
    child_name: str,
) -> tuple[tuple[str, str, str, str], ...]:
    return tuple(
        rule for rule in COMPACT_JSON_REFERENCE_RULES if rule[0] == child_name
    )


def _read_selected_json_references(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    child_name: str,
    child_keys: set[tuple[Any, ...]],
    batch_size: int,
) -> tuple[
    dict[tuple[str, str, str, str], set[tuple[Any, ...]]],
    dict[tuple[str, str, str, str], int],
    dict[tuple[str, str, str, str], int],
]:
    """Read JSON lineage IDs from an exact set of already-selected rows."""

    rules = _json_reference_rules_for_child(child_name)
    references = {rule: set() for rule in rules}
    occurrences = {rule: 0 for rule in rules}
    invalid_values = {rule: 0 for rule in rules}
    if not child_keys or not rules:
        return references, occurrences, invalid_values

    child = source_schema[child_name]
    columns_by_name = {column.name: column for column in child.columns}
    metadata_columns = sorted({rule[1] for rule in rules})
    for metadata_column in metadata_columns:
        column = columns_by_name.get(metadata_column)
        if column is None or not _is_json_column(column):
            raise ContractError(
                f"Compact JSON lineage requires {child_name}.{metadata_column} to be JSON"
            )
    for rule in rules:
        parent = source_schema[rule[3]]
        if len(parent.primary_key) != 1:
            raise ContractError(
                f"Compact JSON lineage requires a single-column primary key on {parent.name}"
            )

    select_columns = list(child.primary_key) + metadata_columns
    indexes = {name: index for index, name in enumerate(select_columns)}
    for row in _iter_mysql_rows_for_keys(
        connection,
        child,
        select_columns,
        child.primary_key,
        child_keys,
        batch_size,
    ):
        parsed_metadata: dict[str, Any] = {}
        for metadata_column in metadata_columns:
            raw_metadata = row[indexes[metadata_column]]
            try:
                parsed_metadata[metadata_column] = _parse_json_value(raw_metadata)
            except (UnicodeDecodeError, json.JSONDecodeError, TypeError) as error:
                raise ContractError(
                    f"Invalid JSON in {child_name}.{metadata_column} during compact lineage closure"
                ) from error
        for rule in rules:
            _, metadata_column, metadata_key, _ = rule
            metadata = parsed_metadata[metadata_column]
            if not isinstance(metadata, Mapping) or metadata_key not in metadata:
                continue
            value = metadata[metadata_key]
            if value is None:
                continue
            if not isinstance(value, str) or not value.strip():
                invalid_values[rule] += 1
                continue
            references[rule].add(_freeze_key([value]))
            occurrences[rule] += 1
    return references, occurrences, invalid_values


def _select_existing_primary_keys(
    connection: Any,
    table: TableInfo,
    candidate_keys: set[tuple[Any, ...]],
    batch_size: int,
) -> set[tuple[Any, ...]]:
    if not candidate_keys:
        return set()
    return {
        _freeze_key(row[: len(table.primary_key)])
        for row in _iter_mysql_rows_for_keys(
            connection,
            table,
            table.primary_key,
            table.primary_key,
            candidate_keys,
            batch_size,
        )
    }


def _add_json_reference_closure(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    selected: dict[str, set[tuple[Any, ...]]],
    processed: dict[str, set[tuple[Any, ...]]],
    batch_size: int,
    eligible_child_keys: Mapping[str, set[tuple[Any, ...]]] | None = None,
) -> int:
    """Close legacy JSON edges and narrow odds descendants incrementally."""

    added = 0
    referenced_odds_snapshots: set[tuple[Any, ...]] = set()
    child_names = sorted({rule[0] for rule in COMPACT_JSON_REFERENCE_RULES})
    for child_name in child_names:
        eligible = (
            selected[child_name]
            if eligible_child_keys is None
            else selected[child_name] & eligible_child_keys[child_name]
        )
        new_child_keys = eligible - processed[child_name]
        if not new_child_keys:
            continue
        processed[child_name].update(new_child_keys)
        references, _, _ = _read_selected_json_references(
            connection,
            source_schema,
            child_name,
            new_child_keys,
            batch_size,
        )
        for rule in _json_reference_rules_for_child(child_name):
            parent = source_schema[rule[3]]
            existing_parent_keys = _select_existing_primary_keys(
                connection,
                parent,
                references[rule],
                batch_size,
            )
            new_parent_keys = existing_parent_keys - selected[parent.name]
            selected[parent.name].update(new_parent_keys)
            added += len(new_parent_keys)
            if rule == COMPACT_JSON_ODDS_REFERENCE_RULE:
                referenced_odds_snapshots.update(existing_parent_keys)

    # A source that explicitly names an odds snapshot also names the exact raw
    # observation whose quote set explains it. Select only deduplicated quotes
    # belonging to those JSON-referenced snapshots, never prediction siblings.
    if referenced_odds_snapshots:
        quote_keys = _select_deduped_odds_quote_keys(
            connection,
            source_schema["odds_quotes"],
            referenced_odds_snapshots,
            batch_size,
        )
        new_quote_keys = quote_keys - selected["odds_quotes"]
        selected["odds_quotes"].update(new_quote_keys)
        added += len(new_quote_keys)
    return added


def _audit_compact_json_reference_closure(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    retained: Mapping[str, set[tuple[Any, ...]]],
    batch_size: int,
    eligible_child_keys: Mapping[str, set[tuple[Any, ...]]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    stats_by_rule: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    violations: list[dict[str, Any]] = []
    referenced_odds_snapshots: set[tuple[Any, ...]] = set()

    child_names = sorted({rule[0] for rule in COMPACT_JSON_REFERENCE_RULES})
    for child_name in child_names:
        materialized_child_keys = (
            set(retained[child_name])
            if eligible_child_keys is None
            else retained[child_name] & eligible_child_keys[child_name]
        )
        references, occurrences, invalid_values = _read_selected_json_references(
            connection,
            source_schema,
            child_name,
            materialized_child_keys,
            batch_size,
        )
        for rule in _json_reference_rules_for_child(child_name):
            _, metadata_column, metadata_key, parent_name = rule
            selected_parent_references = references[rule] & retained[parent_name]
            missing_references = references[rule] - retained[parent_name]
            stats_by_rule[rule] = {
                "edgeType": "json-parent",
                "childTable": child_name,
                "metadataColumn": metadata_column,
                "metadataKey": metadata_key,
                "parentTable": parent_name,
                "retainedChildRows": len(retained[child_name]),
                "materializedChildRows": len(materialized_child_keys),
                "selectedChildRows": len(materialized_child_keys),
                "referenceOccurrences": occurrences[rule],
                "distinctReferences": len(references[rule]),
                "selectedDistinctParents": len(selected_parent_references),
                "missingDistinctParents": len(missing_references),
                "invalidReferenceValues": invalid_values[rule],
            }
            if missing_references or invalid_values[rule]:
                violations.append(
                    {
                        "childTable": child_name,
                        "metadataColumn": metadata_column,
                        "metadataKey": metadata_key,
                        "parentTable": parent_name,
                        "missingReferences": len(missing_references),
                        "invalidReferenceValues": invalid_values[rule],
                    }
                )
            if rule == COMPACT_JSON_ODDS_REFERENCE_RULE:
                referenced_odds_snapshots.update(references[rule])

    expected_quote_keys = _select_deduped_odds_quote_keys(
        connection,
        source_schema["odds_quotes"],
        referenced_odds_snapshots,
        batch_size,
    )
    selected_quote_keys = expected_quote_keys & retained["odds_quotes"]
    missing_quote_keys = expected_quote_keys - retained["odds_quotes"]
    quote_stat = {
        "edgeType": "json-odds-snapshot-quotes",
        "childTable": "source_records",
        "metadataColumn": "metadata",
        "metadataKey": "oddsSnapshotId",
        "parentTable": "odds_quotes",
        "referencedSnapshotCount": len(referenced_odds_snapshots),
        "expectedDedupedQuotes": len(expected_quote_keys),
        "selectedDedupedQuotes": len(selected_quote_keys),
        "missingDedupedQuotes": len(missing_quote_keys),
        "invalidReferenceValues": 0,
    }
    if missing_quote_keys:
        violations.append(
            {
                "childTable": "source_records",
                "metadataColumn": "metadata",
                "metadataKey": "oddsSnapshotId",
                "parentTable": "odds_quotes",
                "missingReferences": len(missing_quote_keys),
                "invalidReferenceValues": 0,
            }
        )
    stats = [stats_by_rule[rule] for rule in COMPACT_JSON_REFERENCE_RULES]
    stats.append(quote_stat)
    return stats, violations


def _add_retained_structural_closure(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    retained: dict[str, set[tuple[Any, ...]]],
    processed_parents: dict[str, set[tuple[Any, ...]]],
    processed_json: dict[str, set[tuple[Any, ...]]],
    batch_size: int,
    json_materialized_child_keys: Mapping[str, set[tuple[Any, ...]]],
) -> int:
    """Close parents and materialized JSON refs without adding old children.

    Non-durable children are independently seeded by their retention windows.
    Downward expansion here would copy rows that the first retention pass is
    guaranteed to remove. Durable lineage uses ``_add_descendant_closure`` in
    its separate fixed-point loop before reaching this phase.
    """

    added = _add_parent_closure(
        connection,
        source_schema,
        retained,
        processed_parents,
        batch_size,
        True,
    )
    added += _add_json_reference_closure(
        connection,
        source_schema,
        retained,
        processed_json,
        batch_size,
        json_materialized_child_keys,
    )
    return added


def _select_json_materialized_child_keys(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    as_of: dt.datetime,
    durable: Mapping[str, set[tuple[Any, ...]]],
    batch_size: int,
) -> dict[str, set[tuple[Any, ...]]]:
    """Select child rows whose JSON metadata will be present after COPY."""

    child_names = sorted({rule[0] for rule in COMPACT_JSON_REFERENCE_RULES})
    if set(COMPACT_JSON_METADATA_HOT_RULES) != set(child_names):
        raise ContractError("Compact JSON metadata hot rules are incomplete")

    mysql_as_of = as_of.replace(tzinfo=None)
    materialized: dict[str, set[tuple[Any, ...]]] = {}
    for child_name in child_names:
        timestamp_columns = COMPACT_JSON_METADATA_HOT_RULES[child_name]
        prune_rule = COMPACT_BLOB_PRUNE_RULES.get(child_name)
        if (
            prune_rule is None
            or prune_rule[0] != timestamp_columns
            or prune_rule[1] != COMPACT_PAYLOAD_RETENTION_DAYS
            or "metadata" not in prune_rule[2]
        ):
            raise ContractError(
                f"Compact JSON metadata selection does not match the COPY transform for {child_name}"
            )
        available = {column.name for column in source_schema[child_name].columns}
        if not set(timestamp_columns).issubset(available):
            raise ContractError(
                f"JSON metadata retention columns missing from {child_name!r}: "
                + ", ".join(timestamp_columns)
            )
        timestamp_sql = (
            quote_mysql_identifier(timestamp_columns[0])
            if len(timestamp_columns) == 1
            else "COALESCE("
            + ", ".join(quote_mysql_identifier(item) for item in timestamp_columns)
            + ")"
        )
        cutoff = (
            as_of - dt.timedelta(days=COMPACT_PAYLOAD_RETENTION_DAYS)
        ).replace(tzinfo=None)
        hot_keys = _select_source_keys(
            connection,
            source_schema[child_name],
            batch_size,
            f"{timestamp_sql} >= %s AND {timestamp_sql} <= %s",
            (cutoff, mysql_as_of),
        )
        materialized[child_name] = hot_keys | set(durable[child_name])
    return materialized


def _build_compact_selection(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    as_of: dt.datetime,
    batch_size: int,
) -> tuple[
    dict[str, set[tuple[Any, ...]]],
    dict[str, set[tuple[Any, ...]]],
    dict[str, set[tuple[Any, ...]]],
    dict[str, int],
    int,
    int,
]:
    retained = {table_name: set() for table_name in source_schema}
    durable = {table_name: set() for table_name in source_schema}
    seed_counts = {table_name: 0 for table_name in source_schema}

    for table_name in sorted(COMPACT_FOREVER_TABLES | COMPACT_CURRENT_TABLES):
        retained[table_name] = _select_source_keys(
            connection, source_schema[table_name], batch_size
        )
        seed_counts[table_name] = len(retained[table_name])
        if table_name in COMPACT_CURRENT_TABLES:
            durable[table_name].update(retained[table_name])

    mysql_as_of = as_of.replace(tzinfo=None)
    for table_name, (timestamp_columns, retention_days) in sorted(
        COMPACT_RECENT_RULES.items()
    ):
        available = {column.name for column in source_schema[table_name].columns}
        if not set(timestamp_columns).issubset(available):
            raise ContractError(
                f"Retention columns missing from {table_name!r}: "
                + ", ".join(timestamp_columns)
            )
        timestamp_sql = (
            quote_mysql_identifier(timestamp_columns[0])
            if len(timestamp_columns) == 1
            else "COALESCE("
            + ", ".join(quote_mysql_identifier(item) for item in timestamp_columns)
            + ")"
        )
        cutoff = (as_of - dt.timedelta(days=retention_days)).replace(tzinfo=None)
        if table_name in COMPACT_EXACT_DEDUPE_PARTITIONS:
            retained[table_name] = _select_recent_deduped_keys(
                connection,
                source_schema[table_name],
                COMPACT_EXACT_DEDUPE_PARTITIONS[table_name],
                timestamp_columns[0],
                cutoff,
                mysql_as_of,
                batch_size,
            )
        else:
            retained[table_name] = _select_source_keys(
                connection,
                source_schema[table_name],
                batch_size,
                f"{timestamp_sql} >= %s AND {timestamp_sql} <= %s",
                (cutoff, mysql_as_of),
            )
        seed_counts[table_name] = len(retained[table_name])

    # Only publications inside the 60-day history cap seed durable lineage.
    # Publications older than that are deliberately not retained and therefore
    # cannot pin their runs, predictions, parlays, research, or raw rows.
    durable["public_recommendation_publications"].update(
        retained["public_recommendation_publications"]
    )

    # Retain the complete, deduplicated seven-day quote set for recent odds
    # snapshots.  Older snapshots pulled by a prediction later retain only the
    # exact quote referenced by that prediction, not every sibling quote.
    retained["odds_quotes"] = _select_deduped_odds_quote_keys(
        connection,
        source_schema["odds_quotes"],
        retained["odds_snapshots"],
        batch_size,
    )
    seed_counts["odds_quotes"] = len(retained["odds_quotes"])

    initial_rows = sum(len(keys) for keys in retained.values())

    # Durable lineage starts only at the publication ledger and current Gambeta
    # state.  A recent run is not expanded into every descendant.
    durable_processed_parents = {table_name: set() for table_name in source_schema}
    durable_processed_descendants: dict[
        tuple[str, str, str], set[tuple[Any, ...]]
    ] = defaultdict(set)
    durable_processed_json = {
        child_name: set()
        for child_name in {rule[0] for rule in COMPACT_JSON_REFERENCE_RULES}
    }
    iterations = 0
    while True:
        iterations += 1
        if iterations > 100:
            raise ContractError("compact-free lineage closure did not converge")
        added = _add_parent_closure(
            connection,
            source_schema,
            durable,
            durable_processed_parents,
            batch_size,
            False,
        )
        added += _add_descendant_closure(
            connection,
            source_schema,
            durable,
            durable_processed_descendants,
            batch_size,
            COMPACT_DESCENDANT_RELATIONS,
        )
        added += _add_json_reference_closure(
            connection,
            source_schema,
            durable,
            durable_processed_json,
            batch_size,
        )
        if added == 0:
            break

    for table_name in source_schema:
        retained[table_name].update(durable[table_name])

    json_materialized_child_keys = _select_json_materialized_child_keys(
        connection,
        source_schema,
        as_of,
        durable,
        batch_size,
    )

    # All retained rows close parents, but only their time-window seeds remain
    # selected: non-durable parents do not pull historical descendants back
    # into COPY. Nullable links into pruned raw tables are intentionally
    # transformed to NULL during COPY.
    retained_processed_parents = {table_name: set() for table_name in source_schema}
    retained_processed_json = {
        child_name: set()
        for child_name in {rule[0] for rule in COMPACT_JSON_REFERENCE_RULES}
    }
    while True:
        iterations += 1
        if iterations > 200:
            raise ContractError("compact-free structural closure did not converge")
        added = _add_retained_structural_closure(
            connection,
            source_schema,
            retained,
            retained_processed_parents,
            retained_processed_json,
            batch_size,
            json_materialized_child_keys,
        )
        if added == 0:
            break

    closure_added = sum(len(keys) for keys in retained.values()) - initial_rows
    return (
        retained,
        durable,
        json_materialized_child_keys,
        seed_counts,
        iterations,
        closure_added,
    )


def _audit_compact_fk_closure(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    retained: Mapping[str, set[tuple[Any, ...]]],
    batch_size: int,
) -> list[dict[str, Any]]:
    violations: dict[tuple[str, str, str], int] = defaultdict(int)
    for child_name in sorted(source_schema):
        child = source_schema[child_name]
        groups = _foreign_key_groups(child)
        if not retained[child_name] or not groups:
            continue
        fk_columns = sorted({item.child_column for group in groups for item in group})
        select_columns = list(child.primary_key) + fk_columns
        indexes = {name: index for index, name in enumerate(select_columns)}
        for row in _iter_mysql_rows_for_keys(
            connection,
            child,
            select_columns,
            child.primary_key,
            retained[child_name],
            batch_size,
        ):
            for group in groups:
                _assert_fk_references_parent_pk(group, source_schema)
                by_parent_column = {
                    item.parent_column: row[indexes[item.child_column]] for item in group
                }
                if any(value is None for value in by_parent_column.values()):
                    continue
                parent = source_schema[group[0].parent_table]
                parent_key = _freeze_key(
                    [by_parent_column[column] for column in parent.primary_key]
                )
                if parent_key not in retained[parent.name]:
                    if _compact_fk_can_be_nulled(group, source_schema):
                        continue
                    violations[(child_name, parent.name, group[0].constraint_name)] += 1
    return [
        {
            "childTable": child,
            "parentTable": parent,
            "constraint": constraint,
            "missingReferences": count,
        }
        for (child, parent, constraint), count in sorted(violations.items())
    ]


def _selected_parent_keys(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    child_table_name: str,
    child_keys: set[tuple[Any, ...]],
    parent_table_name: str,
    batch_size: int,
) -> set[tuple[Any, ...]]:
    if not child_keys:
        return set()
    child = source_schema[child_table_name]
    parent = source_schema[parent_table_name]
    groups = [
        group
        for group in _foreign_key_groups(child)
        if group[0].parent_table == parent_table_name
    ]
    if len(groups) != 1:
        raise ContractError(
            f"Expected one lineage relation from {child_table_name} to {parent_table_name}"
        )
    group = groups[0]
    _assert_fk_references_parent_pk(group, source_schema)
    fk_columns = [item.child_column for item in group]
    select_columns = list(child.primary_key) + fk_columns
    indexes = {name: index for index, name in enumerate(select_columns)}
    result: set[tuple[Any, ...]] = set()
    for row in _iter_mysql_rows_for_keys(
        connection,
        child,
        select_columns,
        child.primary_key,
        child_keys,
        batch_size,
    ):
        values_by_parent = {
            item.parent_column: row[indexes[item.child_column]] for item in group
        }
        if any(value is None for value in values_by_parent.values()):
            continue
        result.add(
            _freeze_key([values_by_parent[column] for column in parent.primary_key])
        )
    return result


def _build_protected_column_keys(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    retained: Mapping[str, set[tuple[Any, ...]]],
    durable: Mapping[str, set[tuple[Any, ...]]],
    batch_size: int,
) -> dict[str, set[tuple[Any, ...]]]:
    prediction_quote_keys = _selected_parent_keys(
        connection,
        source_schema,
        "predictions",
        retained["predictions"],
        "odds_quotes",
        batch_size,
    )
    # A durable source may reference a historical odds snapshot only through
    # JSON. Its narrowly selected quote set is durable too, so retain quote
    # metadata even when no prediction points at those exact quote rows.
    protected: dict[str, set[tuple[Any, ...]]] = {
        "odds_quotes.metadata": prediction_quote_keys
        | set(durable.get("odds_quotes", set())),
    }
    # Optional payload pruning applies only to non-published history.  Every
    # payload belonging to the transitive durable closure of a publication in
    # the 60-day ledger remains byte-for-byte available for audit/replay.
    for table_name, (_, _, blob_columns) in COMPACT_BLOB_PRUNE_RULES.items():
        durable_table_keys = set(durable[table_name])
        if not durable_table_keys:
            continue
        for column_name in blob_columns:
            protected[f"{table_name}.{column_name}"] = durable_table_keys
    return protected


def _audit_full_fk_closure(
    connection: Any, source_schema: Mapping[str, TableInfo]
) -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []
    cursor = connection.cursor(buffered=True)
    try:
        for child_name in sorted(source_schema):
            child = source_schema[child_name]
            for group in _foreign_key_groups(child):
                parent = source_schema[group[0].parent_table]
                join_sql = " AND ".join(
                    f"p.{quote_mysql_identifier(item.parent_column)} = "
                    f"c.{quote_mysql_identifier(item.child_column)}"
                    for item in group
                )
                required_sql = " AND ".join(
                    f"c.{quote_mysql_identifier(item.child_column)} IS NOT NULL"
                    for item in group
                )
                cursor.execute(
                    f"SELECT COUNT(*) FROM {quote_mysql_identifier(child_name)} AS c "
                    f"LEFT JOIN {quote_mysql_identifier(parent.name)} AS p ON {join_sql} "
                    f"WHERE {required_sql} AND "
                    f"p.{quote_mysql_identifier(parent.primary_key[0])} IS NULL"
                )
                row = cursor.fetchone()
                missing = int(row[0]) if row else 0
                if missing:
                    violations.append(
                        {
                            "childTable": child_name,
                            "parentTable": parent.name,
                            "constraint": group[0].constraint_name,
                            "missingReferences": missing,
                        }
                    )
    finally:
        cursor.close()
    return violations


def _source_counts_and_allocated_bytes(
    connection: Any, source_schema: Mapping[str, TableInfo]
) -> tuple[dict[str, int], dict[str, int]]:
    counts: dict[str, int] = {}
    cursor = connection.cursor(buffered=True)
    try:
        for table_name in sorted(source_schema):
            cursor.execute(
                f"SELECT COUNT(*) FROM {quote_mysql_identifier(table_name)}"
            )
            row = cursor.fetchone()
            counts[table_name] = int(row[0]) if row else 0
        cursor.execute(
            """
            SELECT table_name, COALESCE(data_length, 0) + COALESCE(index_length, 0)
            FROM information_schema.tables
            WHERE table_schema = %s AND table_type = 'BASE TABLE'
            """,
            (EXPECTED_SOURCE_DATABASE,),
        )
        allocated = {
            str(table_name): int(size or 0)
            for table_name, size in cursor.fetchall()
            if table_name not in EXCLUDED_TABLES
        }
    finally:
        cursor.close()
    return counts, allocated


def _estimate_profile(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    selected_keys: Mapping[str, set[tuple[Any, ...]]] | None,
) -> tuple[list[dict[str, Any]], int, int, int, int]:
    source_counts, allocated_bytes = _source_counts_and_allocated_bytes(
        connection, source_schema
    )
    estimates: list[dict[str, Any]] = []
    for table_name in sorted(source_schema):
        source_rows = source_counts[table_name]
        selected_rows = (
            source_rows if selected_keys is None else len(selected_keys[table_name])
        )
        source_allocated = allocated_bytes.get(table_name, 0)
        fraction = (
            decimal.Decimal(selected_rows) / decimal.Decimal(source_rows)
            if source_rows
            else decimal.Decimal(0)
        )
        selected_source_bytes = int(
            (decimal.Decimal(source_allocated) * fraction).to_integral_value(
                rounding=decimal.ROUND_CEILING
            )
        )
        estimated_target_bytes = int(
            (
                decimal.Decimal(selected_source_bytes)
                * POSTGRES_ESTIMATE_MULTIPLIER
            ).to_integral_value(rounding=decimal.ROUND_CEILING)
        )
        estimates.append(
            {
                "name": table_name,
                "sourceRows": source_rows,
                "selectedRows": selected_rows,
                "estimatedSourceBytes": selected_source_bytes,
                "estimatedTargetBytes": estimated_target_bytes,
            }
        )
    return (
        estimates,
        sum(item["sourceRows"] for item in estimates),
        sum(item["selectedRows"] for item in estimates),
        sum(item["estimatedSourceBytes"] for item in estimates),
        sum(item["estimatedTargetBytes"] for item in estimates),
    )


def build_profile_plan(
    connection: Any,
    source_schema: Mapping[str, TableInfo],
    profile_name: str,
    as_of: dt.datetime | None,
    batch_size: int,
) -> ProfilePlan:
    if set(source_schema) != set(DOMAIN_TABLES):
        raise ContractError("Cannot profile a source outside the 33-table contract")
    if batch_size < 1:
        raise ContractError("batch-size must be at least 1")
    if profile_name == PROFILE_FULL:
        selected_keys = None
        durable_keys = None
        protected_column_keys: dict[str, set[tuple[Any, ...]]] = {}
        seed_counts: dict[str, int] = {}
        closure_iterations = 0
        closure_added_rows = 0
        fk_violations = _audit_full_fk_closure(connection, source_schema)
        json_reference_stats: list[dict[str, Any]] = []
        json_reference_violations: list[dict[str, Any]] = []
    elif profile_name == PROFILE_COMPACT_FREE:
        if as_of is None:
            raise ContractError("compact-free requires an explicit UTC --as-of")
        (
            selected_keys,
            durable_keys,
            json_materialized_child_keys,
            seed_counts,
            closure_iterations,
            closure_added_rows,
        ) = _build_compact_selection(connection, source_schema, as_of, batch_size)
        protected_column_keys = _build_protected_column_keys(
            connection,
            source_schema,
            selected_keys,
            durable_keys,
            batch_size,
        )
        fk_violations = _audit_compact_fk_closure(
            connection, source_schema, selected_keys, batch_size
        )
        (
            json_reference_stats,
            json_reference_violations,
        ) = _audit_compact_json_reference_closure(
            connection,
            source_schema,
            selected_keys,
            batch_size,
            json_materialized_child_keys,
        )
    else:
        raise ContractError(f"Unsupported migration profile: {profile_name}")

    (
        estimates,
        source_rows,
        selected_rows,
        estimated_source_bytes,
        estimated_target_bytes,
    ) = _estimate_profile(connection, source_schema, selected_keys)
    # v1 used a hard-coded row-count snapshot as a second safety gate.  That
    # baseline became stale as legitimate rows were finalized after profiling
    # and blocked an otherwise FK-closed migration.  v2 recomputes an exact,
    # fixed-as-of selection each time and gates on FK closure plus capacity.
    reference_count_mismatches: list[dict[str, Any]] = []
    return ProfilePlan(
        name=profile_name,
        as_of=as_of,
        selected_keys=selected_keys,
        seed_counts=seed_counts,
        closure_iterations=closure_iterations,
        closure_added_rows=closure_added_rows,
        fk_violations=fk_violations,
        table_estimates=estimates,
        source_rows=source_rows,
        selected_rows=selected_rows,
        estimated_source_bytes=estimated_source_bytes,
        estimated_target_bytes=estimated_target_bytes,
        durable_keys=durable_keys,
        protected_column_keys=protected_column_keys,
        reference_count_mismatches=reference_count_mismatches,
        json_reference_stats=json_reference_stats,
        json_reference_violations=json_reference_violations,
    )


def assert_profile_safe(profile: ProfilePlan) -> None:
    if not profile.fk_closed:
        raise SafetyError(
            f"Profile {profile.name!r} does not close all retained foreign keys"
        )
    if not profile.json_references_closed:
        raise SafetyError(
            f"Profile {profile.name!r} does not close all selected JSON lineage references"
        )
    if not profile.within_compact_budget:
        raise SafetyError(
            "compact-free estimate exceeds the conservative 330 MiB profile budget"
        )
    if not profile.reference_profile_matches:
        raise SafetyError(
            "compact-free reference counts differ from the measured closure; "
            "review inventory before copy"
        )


def profile_document(profile: ProfilePlan) -> dict[str, Any]:
    return {
        "name": profile.name,
        "policyVersion": (
            COMPACT_POLICY_VERSION
            if profile.name == PROFILE_COMPACT_FREE
            else None
        ),
        "asOf": _format_as_of(profile.as_of),
        "sourceRows": profile.source_rows,
        "selectedRows": profile.selected_rows,
        "estimatedSourceBytes": profile.estimated_source_bytes,
        "estimatedTargetBytes": profile.estimated_target_bytes,
        "estimateMethod": (
            "exact row counts; proportional MySQL allocated data+index bytes; "
            "1.35x PostgreSQL safety multiplier"
        ),
        "retention": (
            {
                "maximumHistoryDays": COMPACT_MAX_HISTORY_DAYS,
                "rawDays": COMPACT_RAW_RETENTION_DAYS,
                "analyticHotDays": COMPACT_ANALYTIC_RETENTION_DAYS,
                "researchDays": COMPACT_RESEARCH_RETENTION_DAYS,
                "validationDays": COMPACT_VALIDATION_RETENTION_DAYS,
                "transientDays": COMPACT_TRANSIENT_RETENTION_DAYS,
                "optionalMetadataDays": COMPACT_BLOB_RETENTION_DAYS,
                "largePayloadDays": COMPACT_PAYLOAD_RETENTION_DAYS,
                "publicationLineageDays": COMPACT_MAX_HISTORY_DAYS,
                "rawOddsSnapshotPolicy": (
                    "latest-per-fixture-plus-fk-and-json-referenced-with-narrow-quotes"
                ),
                "referencedCatalogPolicy": (
                    "competitions-and-teams-selected-only-by-retained-foreign-keys"
                ),
                "nonDurableDescendantPolicy": (
                    "time-window-seeds-plus-upward-fk-and-materialized-json-closure"
                ),
            }
            if profile.name == PROFILE_COMPACT_FREE
            else None
        ),
        "compactBudgetBytes": (
            COMPACT_FREE_MAX_ESTIMATED_BYTES
            if profile.name == PROFILE_COMPACT_FREE
            else None
        ),
        "withinCompactBudget": profile.within_compact_budget,
        "referenceProfileMatches": profile.reference_profile_matches,
        "referenceCountMismatches": profile.reference_count_mismatches,
        "referenceBaseline": None,
        "measuredTargetRangeBytes": None,
        "foreignKeyClosed": profile.fk_closed,
        "foreignKeyViolations": profile.fk_violations,
        "jsonReferenceClosed": profile.json_references_closed,
        "jsonReferenceStats": profile.json_reference_stats,
        "jsonReferenceViolations": profile.json_reference_violations,
        "seedCounts": profile.seed_counts,
        "closureIterations": profile.closure_iterations,
        "closureAddedRows": profile.closure_added_rows,
        "tables": profile.table_estimates,
    }


def inventory_document(
    source_schema: Mapping[str, TableInfo],
    target_schema: Mapping[str, TableInfo],
    profile: ProfilePlan,
    target_database_bytes: int,
    target_managed_relation_bytes: int = 0,
    replace_target: bool = False,
) -> dict[str, Any]:
    set_report = schema_set_report(source_schema, target_schema)
    column_report = column_contract_report(source_schema, target_schema)
    compatible = not any(
        set_report[key]
        for key in (
            "sourceMissingExpected",
            "sourceUnexpected",
            "targetMissingExpected",
            "targetUnexpected",
            "sourceOnly",
            "targetOnly",
        )
    ) and not column_report["mismatchCount"]
    order: list[str] = []
    cycle_error: str | None = None
    try:
        order = topological_order(source_schema, dependencies_from_schema(source_schema))
    except ContractError as error:
        compatible = False
        cycle_error = str(error)
    projected_target_bytes = projected_target_database_size(
        profile,
        target_database_bytes,
        target_managed_relation_bytes,
        replace_target=replace_target,
    )
    compatible = (
        compatible
        and profile.fk_closed
        and profile.json_references_closed
        and profile.within_compact_budget
        and profile.reference_profile_matches
        and projected_target_bytes <= TARGET_SIZE_HARD_LIMIT_BYTES
    )

    return {
        "version": 1,
        "command": "inventory",
        "status": "ready" if compatible else "mismatch",
        "replaceTargetProjection": replace_target,
        "privacy": {"containsRowData": False, "containsConnectionDetails": False},
        "tableSets": set_report,
        "columns": column_report,
        "copyOrder": order,
        "cycleError": cycle_error,
        "profile": profile_document(profile),
        "targetCapacity": target_capacity_document(
            target_database_bytes,
            projected_target_bytes,
            managed_relation_bytes=target_managed_relation_bytes,
            calculation_mode="replacement" if replace_target else "append",
        ),
        "tables": [
            {
                "name": table_name,
                "columnCount": len(source_schema[table_name].columns),
                "primaryKey": list(source_schema[table_name].primary_key),
                "dependencies": sorted(
                    dependencies_from_schema(source_schema).get(table_name, set())
                ),
            }
            for table_name in sorted(set(source_schema) & set(DOMAIN_TABLES))
        ],
    }


def _target_count(connection: Any, schema_name: str, table_name: str) -> int:
    cursor = connection.cursor()
    try:
        cursor.execute(
            f"SELECT COUNT(*) FROM {quote_identifier(schema_name)}.{quote_identifier(table_name)}"
        )
        row = cursor.fetchone()
        return int(row[0])
    finally:
        cursor.close()


def _target_database_size(connection: Any) -> int:
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT pg_database_size(current_database())")
        row = cursor.fetchone()
        return int(row[0]) if row else 0
    finally:
        cursor.close()


def _target_managed_relation_size(connection: Any, schema_name: str) -> int:
    """Return heap+index+TOAST bytes for managed domain/auxiliary tables only."""

    managed_tables = sorted(DOMAIN_TABLES | TARGET_AUXILIARY_TABLES)
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            SELECT COALESCE(SUM(pg_total_relation_size(cls.oid)), 0)
            FROM pg_class AS cls
            JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
            WHERE ns.nspname = %s
              AND cls.relname = ANY(%s)
              AND cls.relkind IN ('r', 'p')
            """,
            (schema_name, managed_tables),
        )
        row = cursor.fetchone()
        return int(row[0]) if row else 0
    finally:
        cursor.close()


def target_capacity_document(
    current_bytes: int,
    projected_or_actual_bytes: int,
    *,
    managed_relation_bytes: int = 0,
    calculation_mode: str = "append",
) -> dict[str, Any]:
    if calculation_mode not in {"append", "replacement", "actual"}:
        raise ContractError(f"Unsupported target capacity mode: {calculation_mode}")
    if projected_or_actual_bytes > TARGET_SIZE_HARD_LIMIT_BYTES:
        status = "hard-limit"
    elif projected_or_actual_bytes > TARGET_SIZE_ALERT_BYTES:
        status = "alert"
    else:
        status = "within-target"
    retained_before_estimate = None
    if calculation_mode == "replacement":
        retained_before_estimate = max(0, current_bytes - managed_relation_bytes)
    elif calculation_mode == "append":
        retained_before_estimate = current_bytes
    return {
        "currentDatabaseBytes": current_bytes,
        "managedRelationBytes": managed_relation_bytes,
        "calculationMode": calculation_mode,
        "retainedDatabaseBytesBeforeEstimate": retained_before_estimate,
        "projectedOrActualDatabaseBytes": projected_or_actual_bytes,
        "alertBytes": TARGET_SIZE_ALERT_BYTES,
        "hardLimitBytes": TARGET_SIZE_HARD_LIMIT_BYTES,
        "status": status,
        "minimalFreeFallbackAvailable": MINIMAL_FREE_PROFILE_AVAILABLE,
    }


def projected_target_database_size(
    profile: ProfilePlan,
    current_bytes: int,
    managed_relation_bytes: int = 0,
    *,
    replace_target: bool = False,
) -> int:
    base_bytes = (
        max(0, current_bytes - managed_relation_bytes)
        if replace_target
        else current_bytes
    )
    return base_bytes + profile.estimated_target_bytes


def _adapt_for_copy(value: Any, column: ColumnInfo) -> str | None:
    if value is None:
        return None
    if _is_json_column(column):
        return _serialize_json_for_storage(value)
    if _is_boolean_column(column):
        if isinstance(value, (bytes, bytearray, memoryview)):
            raw = bytes(value)
            value = int.from_bytes(raw, "big") if raw else 0
        if isinstance(value, str):
            value = value.strip().lower() in {"1", "true", "t", "yes", "y"}
        return "true" if bool(value) else "false"
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        else:
            value = value.astimezone(dt.timezone.utc)
        if column.data_type.lower() == "timestamp without time zone":
            value = value.replace(tzinfo=None)
        return value.isoformat(timespec="microseconds")
    if isinstance(value, (dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return format(value, "f")
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ContractError("Non-finite float cannot be copied to PostgreSQL")
        return repr(value)
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (bytes, bytearray, memoryview)):
        if column.native_type.lower() != "bytea" and column.data_type.lower() != "bytea":
            raise ContractError(
                f"Binary source value targets non-bytea column {column.name!r}"
            )
        return "\\x" + bytes(value).hex()
    if isinstance(value, (str, int)):
        return str(value)
    if isinstance(value, (dict, list, tuple)):
        return _serialize_json_for_storage(value)
    raise ContractError(f"Unsupported COPY value type: {type(value).__name__}")


def _serialize_json_for_storage(value: Any) -> str:
    """Serialize JSON without rounding connector-provided Decimal values."""

    if isinstance(value, (bytes, bytearray, memoryview)):
        value = bytes(value).decode("utf-8")
    if isinstance(value, str):
        # MySQL returns JSON columns as their original JSON text.  Validate it,
        # then preserve the text so long decimals are not routed through float.
        json.loads(value, parse_float=decimal.Decimal, parse_int=decimal.Decimal)
        return value
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):  # pragma: no cover - handled above for top level
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, decimal.Decimal):
        if not value.is_finite():
            raise ContractError("Non-finite number is invalid JSON")
        return format(value, "f")
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ContractError("Non-finite number is invalid JSON")
        return json.dumps(value, allow_nan=False)
    if isinstance(value, Mapping):
        parts = []
        for key, item in value.items():
            parts.append(
                json.dumps(str(key), ensure_ascii=False)
                + ":"
                + _serialize_json_nested(item)
            )
        return "{" + ",".join(parts) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_serialize_json_nested(item) for item in value) + "]"
    if isinstance(value, dt.datetime):
        return json.dumps(_normalize_datetime(value), ensure_ascii=False)
    if isinstance(value, (dt.date, dt.time)):
        return json.dumps(value.isoformat(), ensure_ascii=False)
    raise ContractError(f"Unsupported JSON storage type: {type(value).__name__}")


def _serialize_json_nested(value: Any) -> str:
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return json.dumps(base64.b64encode(bytes(value)).decode("ascii"))
    return _serialize_json_for_storage(value)


def _encode_copy_csv_row(values: Sequence[str | None]) -> str:
    # PostgreSQL CSV distinguishes an unquoted NULL marker from quoted data.
    # Quote every non-null field explicitly so a real string "\\N" is safe.
    fields = [
        r"\N" if value is None else '"' + value.replace('"', '""') + '"'
        for value in values
    ]
    return ",".join(fields) + "\n"


def _profile_utc_datetime(value: Any) -> dt.datetime | None:
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc)
    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min, tzinfo=dt.timezone.utc)
    return None


def _profile_observed_at(
    values: Sequence[Any],
    indexes: Mapping[str, int],
    timestamp_columns: Sequence[str],
) -> dt.datetime | None:
    # Match the COALESCE order used by compact seed selection.
    for column_name in timestamp_columns:
        index = indexes.get(column_name)
        if index is None:
            continue
        observed = _profile_utc_datetime(values[index])
        if observed is not None:
            return observed
    return None


def _transform_row_for_profile(
    row: Sequence[Any],
    table: TableInfo,
    source_schema: Mapping[str, TableInfo],
    profile: ProfilePlan,
) -> tuple[Any, ...]:
    if profile.name == PROFILE_FULL:
        return tuple(row)
    if profile.selected_keys is None or profile.as_of is None:
        raise ContractError("compact-free row transformation requires a selection plan")

    values = list(row)
    indexes = {column.name: index for index, column in enumerate(table.columns)}
    primary_key = _freeze_key([values[indexes[name]] for name in table.primary_key])

    # Optional raw references that were deliberately pruned become NULL.  This
    # transformation is included in source-side verification hashing.
    for group in _foreign_key_groups(table):
        if not _compact_fk_can_be_nulled(group, source_schema):
            continue
        parent = source_schema[group[0].parent_table]
        by_parent = {
            item.parent_column: values[indexes[item.child_column]] for item in group
        }
        if any(value is None for value in by_parent.values()):
            continue
        parent_key = _freeze_key([by_parent[name] for name in parent.primary_key])
        if parent_key not in profile.selected_keys[parent.name]:
            for item in group:
                values[indexes[item.child_column]] = None

    if table.name == "odds_quotes" and "metadata" in indexes:
        protected = profile.protected_column_keys.get("odds_quotes.metadata", set())
        if primary_key not in protected:
            values[indexes["metadata"]] = None

    prune_rule = COMPACT_BLOB_PRUNE_RULES.get(table.name)
    if prune_rule is not None:
        timestamp_columns, retention_days, blob_columns = prune_rule
        observed = _profile_observed_at(values, indexes, timestamp_columns)
        cutoff = profile.as_of - dt.timedelta(days=retention_days)
        if observed is not None and observed < cutoff:
            for column_name in blob_columns:
                if column_name not in indexes:
                    continue
                protected = profile.protected_column_keys.get(
                    f"{table.name}.{column_name}", set()
                )
                if primary_key not in protected:
                    values[indexes[column_name]] = None
    return tuple(values)


def _copy_table(
    source_connection: Any,
    target_connection: Any,
    source_table: TableInfo,
    target_table: TableInfo,
    target_schema_name: str,
    batch_size: int,
    selected_keys: set[tuple[Any, ...]] | None,
    source_schema: Mapping[str, TableInfo],
    profile: ProfilePlan,
) -> int:
    target_columns_by_name = {column.name: column for column in target_table.columns}
    columns = list(source_table.columns)
    target_columns = [target_columns_by_name[column.name] for column in columns]
    column_names = [column.name for column in columns]
    select_columns = ", ".join(quote_mysql_identifier(name) for name in column_names)
    order_columns = ", ".join(
        quote_mysql_identifier(name) for name in source_table.primary_key
    )
    source_sql = (
        f"SELECT {select_columns} FROM {quote_mysql_identifier(source_table.name)} "
        f"ORDER BY {order_columns}"
    )
    target_columns_sql = ", ".join(quote_identifier(name) for name in column_names)
    copy_sql = (
        f"COPY {quote_identifier(target_schema_name)}.{quote_identifier(target_table.name)} "
        f"({target_columns_sql}) FROM STDIN "
        "WITH (FORMAT CSV, NULL '\\N', QUOTE '\"', ESCAPE '\"')"
    )

    target_cursor = target_connection.cursor()
    copied = 0

    def copy_rows(rows: Sequence[Sequence[Any]]) -> None:
        nonlocal copied
        if not rows:
            return
        buffer = io.StringIO(newline="")
        for row in rows:
            row = _transform_row_for_profile(
                row, source_table, source_schema, profile
            )
            adapted = [
                _adapt_for_copy(value, column)
                for value, column in zip(row, target_columns)
            ]
            buffer.write(_encode_copy_csv_row(adapted))
        buffer.seek(0)
        target_cursor.copy_expert(copy_sql, buffer)
        copied += len(rows)

    try:
        if selected_keys is None:
            source_cursor = source_connection.cursor(buffered=False)
            try:
                source_cursor.execute(source_sql)
                while True:
                    rows = source_cursor.fetchmany(batch_size)
                    if not rows:
                        break
                    copy_rows(rows)
            finally:
                source_cursor.close()
        else:
            pending: list[tuple[Any, ...]] = []
            for row in _iter_mysql_rows_for_keys(
                source_connection,
                source_table,
                column_names,
                source_table.primary_key,
                selected_keys,
                batch_size,
            ):
                pending.append(row)
                if len(pending) >= batch_size:
                    copy_rows(pending)
                    pending = []
            copy_rows(pending)
    finally:
        target_cursor.close()
    return copied


def _synchronize_target_sequences(
    connection: Any, schema_name: str, target_schema: Mapping[str, TableInfo]
) -> int:
    """Advance only PostgreSQL-owned serial/identity sequences to copied maxima."""

    cursor = connection.cursor()
    synchronized = 0
    try:
        for table_name in sorted(set(target_schema) & set(DOMAIN_TABLES)):
            qualified_table = (
                f"{quote_identifier(schema_name)}.{quote_identifier(table_name)}"
            )
            for column in target_schema[table_name].columns:
                cursor.execute(
                    "SELECT pg_get_serial_sequence(%s, %s)",
                    (qualified_table, column.name),
                )
                row = cursor.fetchone()
                sequence_name = row[0] if row else None
                if not sequence_name:
                    continue
                cursor.execute(
                    f"SELECT MAX({quote_identifier(column.name)}) FROM {qualified_table}"
                )
                maximum_row = cursor.fetchone()
                maximum = maximum_row[0] if maximum_row else None
                if maximum is None:
                    cursor.execute("SELECT setval(%s::regclass, 1, false)", (sequence_name,))
                else:
                    cursor.execute(
                        "SELECT setval(%s::regclass, %s, true)",
                        (sequence_name, maximum),
                    )
                synchronized += 1
    finally:
        cursor.close()
    return synchronized


def historical_snapshot_backfill_sql(schema_name: str, table_name: str) -> str:
    if table_name not in HISTORICAL_SNAPSHOT_BACKFILL_TABLES:
        raise ContractError("Historical snapshot backfill table is not allow-listed")
    qualified = f"{quote_identifier(schema_name)}.{quote_identifier(table_name)}"
    return (
        f"UPDATE {qualified} SET "
        f"{quote_identifier('last_seen_at')} = {quote_identifier('captured_at')}, "
        f"{quote_identifier('observation_count')} = 1 "
        f"WHERE {quote_identifier('dedupe_key')} IS NULL"
    )


def _backfill_historical_snapshot_observations(
    connection: Any, schema_name: str
) -> dict[str, int]:
    cursor = connection.cursor()
    counts: dict[str, int] = {}
    try:
        for table_name in HISTORICAL_SNAPSHOT_BACKFILL_TABLES:
            cursor.execute(historical_snapshot_backfill_sql(schema_name, table_name))
            counts[table_name] = max(0, int(cursor.rowcount))
    finally:
        cursor.close()
    return counts


def _verify_historical_snapshot_backfill(
    connection: Any, schema_name: str
) -> dict[str, int]:
    cursor = connection.cursor()
    mismatches: dict[str, int] = {}
    try:
        for table_name in HISTORICAL_SNAPSHOT_BACKFILL_TABLES:
            qualified = (
                f"{quote_identifier(schema_name)}.{quote_identifier(table_name)}"
            )
            cursor.execute(
                f"SELECT COUNT(*) FROM {qualified} "
                f"WHERE {quote_identifier('dedupe_key')} IS NULL AND ("
                f"{quote_identifier('last_seen_at')} IS DISTINCT FROM "
                f"{quote_identifier('captured_at')} OR "
                f"{quote_identifier('observation_count')} IS DISTINCT FROM 1)"
            )
            row = cursor.fetchone()
            mismatches[table_name] = int(row[0]) if row else 0
    finally:
        cursor.close()
    return mismatches


def copy_database(
    source_connection: Any,
    target_connection: Any,
    source_schema: Mapping[str, TableInfo],
    target_schema: Mapping[str, TableInfo],
    target_schema_name: str,
    batch_size: int,
    truncate_target: bool,
    profile: ProfilePlan,
) -> dict[str, Any]:
    assert_schema_contract(source_schema, target_schema)
    assert_profile_safe(profile)
    if batch_size < 1:
        raise ContractError("batch-size must be at least 1")

    target_database_bytes_before = _target_database_size(target_connection)
    target_managed_relation_bytes_before = _target_managed_relation_size(
        target_connection, target_schema_name
    )
    projected_target_bytes = projected_target_database_size(
        profile,
        target_database_bytes_before,
        target_managed_relation_bytes_before,
        replace_target=truncate_target,
    )
    if projected_target_bytes > TARGET_SIZE_HARD_LIMIT_BYTES:
        raise SafetyError(
            "Projected PostgreSQL database size exceeds 400 MiB; copy was not started. "
            "A minimal-free fallback is reserved but not enabled in this version."
        )

    order = topological_order(source_schema, dependencies_from_schema(source_schema))
    preflight_tables = order + sorted(
        set(target_schema) & set(TARGET_AUXILIARY_TABLES)
    )
    target_counts = {
        table_name: _target_count(target_connection, target_schema_name, table_name)
        for table_name in preflight_tables
    }
    nonempty = {table_name: count for table_name, count in target_counts.items() if count > 0}
    target_connection.rollback()  # End read-only count transaction before COPY.
    if nonempty and not truncate_target:
        raise SafetyError(
            "Target contains rows; rerun copy with explicit --truncate-target after review"
        )

    copied_counts: dict[str, int] = {}
    sequences_synchronized = 0
    historical_backfill_counts: dict[str, int] = {}
    try:
        if truncate_target:
            cursor = target_connection.cursor()
            try:
                truncate_tables = list(reversed(order)) + sorted(
                    set(target_schema) & set(TARGET_AUXILIARY_TABLES)
                )
                table_list = ", ".join(
                    f"{quote_identifier(target_schema_name)}.{quote_identifier(table_name)}"
                    for table_name in truncate_tables
                )
                # Listing all domain tables plus the explicit derived auxiliary
                # table satisfies its FK to sports_providers without CASCADE.
                cursor.execute(f"TRUNCATE TABLE {table_list} RESTART IDENTITY")
            finally:
                cursor.close()

        for table_name in order:
            selected_keys = (
                None
                if profile.selected_keys is None
                else profile.selected_keys[table_name]
            )
            copied_counts[table_name] = _copy_table(
                source_connection,
                target_connection,
                source_schema[table_name],
                target_schema[table_name],
                target_schema_name,
                batch_size,
                selected_keys,
                source_schema,
                profile,
            )
        historical_backfill_counts = _backfill_historical_snapshot_observations(
            target_connection, target_schema_name
        )
        sequences_synchronized = _synchronize_target_sequences(
            target_connection, target_schema_name, target_schema
        )
        target_database_bytes_after = _target_database_size(target_connection)
        if target_database_bytes_after > TARGET_SIZE_HARD_LIMIT_BYTES:
            raise SafetyError(
                "PostgreSQL database size exceeded 400 MiB during COPY; transaction rolled back"
            )
        target_connection.commit()
    except BaseException:
        target_connection.rollback()
        raise

    return {
        "version": 1,
        "command": "copy",
        "status": "copied",
        "privacy": {"containsRowData": False, "containsConnectionDetails": False},
        "targetTruncated": truncate_target,
        "atomicTransaction": True,
        "batchSize": batch_size,
        "tableCount": len(order),
        "rowCount": sum(copied_counts.values()),
        "sequencesSynchronized": sequences_synchronized,
        "historicalSnapshotBackfill": historical_backfill_counts,
        "profile": profile_document(profile),
        "targetCapacityPreflight": target_capacity_document(
            target_database_bytes_before,
            projected_target_bytes,
            managed_relation_bytes=target_managed_relation_bytes_before,
            calculation_mode="replacement" if truncate_target else "append",
        ),
        "targetCapacity": target_capacity_document(
            target_database_bytes_before,
            target_database_bytes_after,
            managed_relation_bytes=target_managed_relation_bytes_before,
            calculation_mode="actual",
        ),
        "tables": [
            {"name": table_name, "rowsCopied": copied_counts[table_name]}
            for table_name in order
        ],
    }


def _hash_cursor_rows(
    cursor: Any, columns: Sequence[ColumnInfo], batch_size: int
) -> tuple[int, str]:
    digest = hashlib.sha256()
    count = 0
    while True:
        rows = cursor.fetchmany(batch_size)
        if not rows:
            break
        for row in rows:
            payload = canonical_row_bytes(row, columns)
            digest.update(len(payload).to_bytes(8, byteorder="big", signed=False))
            digest.update(payload)
            count += 1
    return count, digest.hexdigest()


def _hash_row_iterator(
    rows: Iterable[Sequence[Any]], columns: Sequence[ColumnInfo]
) -> tuple[int, str]:
    digest = hashlib.sha256()
    count = 0
    for row in rows:
        payload = canonical_row_bytes(row, columns)
        digest.update(len(payload).to_bytes(8, byteorder="big", signed=False))
        digest.update(payload)
        count += 1
    return count, digest.hexdigest()


def _hash_mysql_table(
    connection: Any,
    table: TableInfo,
    canonical_columns: Sequence[ColumnInfo],
    batch_size: int,
    selected_keys: set[tuple[Any, ...]] | None,
    source_schema: Mapping[str, TableInfo],
    profile: ProfilePlan,
) -> tuple[int, str]:
    names = [column.name for column in table.columns]
    if selected_keys is not None:
        transformed_rows = (
            _transform_row_for_profile(row, table, source_schema, profile)
            for row in _iter_mysql_rows_for_keys(
                connection,
                table,
                names,
                table.primary_key,
                selected_keys,
                batch_size,
            )
        )
        return _hash_row_iterator(
            transformed_rows,
            canonical_columns,
        )
    select_sql = ", ".join(quote_mysql_identifier(name) for name in names)
    order_sql = ", ".join(quote_mysql_identifier(name) for name in table.primary_key)
    cursor = connection.cursor(buffered=False)
    try:
        cursor.execute(
            f"SELECT {select_sql} FROM {quote_mysql_identifier(table.name)} ORDER BY {order_sql}"
        )
        return _hash_cursor_rows(cursor, canonical_columns, batch_size)
    finally:
        cursor.close()


def _postgres_hash_select_expression(column: ColumnInfo) -> str:
    quoted = quote_identifier(column.name)
    if _is_json_column(column):
        # psycopg2 decodes both SQL NULL and the JSON literal null as Python
        # None. Cast non-SQL-NULL JSONB to text so canonical hashing preserves
        # that semantic distinction (and still parses numbers as Decimal).
        return f"CASE WHEN {quoted} IS NULL THEN NULL ELSE {quoted}::text END AS {quoted}"
    return quoted


def _hash_postgres_table(
    connection: Any,
    table: TableInfo,
    canonical_columns: Sequence[ColumnInfo],
    schema_name: str,
    batch_size: int,
    selected_keys: set[tuple[Any, ...]] | None,
) -> tuple[int, str]:
    select_sql = ", ".join(
        _postgres_hash_select_expression(column) for column in canonical_columns
    )
    order_sql = ", ".join(quote_identifier(name) for name in table.primary_key)
    if selected_keys is None:
        cursor_name = "verify_" + hashlib.sha256(table.name.encode("utf-8")).hexdigest()[:16]
        cursor = connection.cursor(name=cursor_name)
        cursor.itersize = batch_size
        try:
            cursor.execute(
                f"SELECT {select_sql} "
                f"FROM {quote_identifier(schema_name)}.{quote_identifier(table.name)} "
                f"ORDER BY {order_sql}"
            )
            return _hash_cursor_rows(cursor, canonical_columns, batch_size)
        finally:
            cursor.close()

    def selected_rows() -> Iterator[tuple[Any, ...]]:
        for key_chunk in _key_chunks(selected_keys, len(table.primary_key)):
            where_sql, params = _postgres_key_predicate(table.primary_key, key_chunk)
            cursor = connection.cursor()
            try:
                cursor.execute(
                    f"SELECT {select_sql} "
                    f"FROM {quote_identifier(schema_name)}.{quote_identifier(table.name)} "
                    f"WHERE {where_sql} ORDER BY {order_sql}",
                    params,
                )
                while True:
                    rows = cursor.fetchmany(batch_size)
                    if not rows:
                        break
                    for row in rows:
                        yield tuple(row)
            finally:
                cursor.close()

    return _hash_row_iterator(selected_rows(), canonical_columns)


def verify_database(
    source_connection: Any,
    target_connection: Any,
    source_schema: Mapping[str, TableInfo],
    target_schema: Mapping[str, TableInfo],
    target_schema_name: str,
    batch_size: int,
    profile: ProfilePlan,
) -> dict[str, Any]:
    set_report = schema_set_report(source_schema, target_schema)
    column_report = column_contract_report(source_schema, target_schema)
    table_contract_matches = not any(
        set_report[key]
        for key in (
            "sourceMissingExpected",
            "sourceUnexpected",
            "targetMissingExpected",
            "targetUnexpected",
            "sourceOnly",
            "targetOnly",
        )
    )
    if batch_size < 1:
        raise ContractError("batch-size must be at least 1")

    table_results: list[dict[str, Any]] = []
    if table_contract_matches and not column_report["mismatchCount"]:
        order = topological_order(source_schema, dependencies_from_schema(source_schema))
        for table_name in order:
            source_table = source_schema[table_name]
            target_table = target_schema[table_name]
            target_by_name = {column.name: column for column in target_table.columns}
            canonical_columns = [target_by_name[column.name] for column in source_table.columns]
            selected_keys = (
                None
                if profile.selected_keys is None
                else profile.selected_keys[table_name]
            )
            source_count, source_hash = _hash_mysql_table(
                source_connection,
                source_table,
                canonical_columns,
                batch_size,
                selected_keys,
                source_schema,
                profile,
            )
            target_count, target_hash = _hash_postgres_table(
                target_connection,
                target_table,
                canonical_columns,
                target_schema_name,
                batch_size,
                selected_keys,
            )
            target_total_count = _target_count(
                target_connection, target_schema_name, table_name
            )
            table_results.append(
                {
                    "name": table_name,
                    "sourceCount": source_count,
                    "targetCount": target_count,
                    "targetTotalCount": target_total_count,
                    "unexpectedTargetRows": target_total_count - target_count,
                    "countsMatch": source_count == target_count,
                    "sourceSha256": source_hash,
                    "targetSha256": target_hash,
                    "sha256Match": source_hash == target_hash,
                }
            )
        target_connection.rollback()  # Close the read-only verification transaction.

    target_database_bytes = _target_database_size(target_connection)
    historical_backfill_mismatches = _verify_historical_snapshot_backfill(
        target_connection, target_schema_name
    )
    target_connection.rollback()
    verified = (
        table_contract_matches
        and not column_report["mismatchCount"]
        and len(table_results) == len(DOMAIN_TABLES)
        and profile.fk_closed
        and profile.json_references_closed
        and profile.within_compact_budget
        and profile.reference_profile_matches
        and target_database_bytes <= TARGET_SIZE_HARD_LIMIT_BYTES
        and not any(historical_backfill_mismatches.values())
        and all(
            item["countsMatch"]
            and item["sha256Match"]
            and item["unexpectedTargetRows"] == 0
            for item in table_results
        )
    )
    return {
        "version": 1,
        "command": "verify",
        "status": "verified" if verified else "mismatch",
        "privacy": {"containsRowData": False, "containsConnectionDetails": False},
        "canonicalHash": "sha256(length-prefixed canonical JSON rows ordered by primary key)",
        "tableSets": set_report,
        "columns": column_report,
        "profile": profile_document(profile),
        "targetCapacity": target_capacity_document(
            target_database_bytes,
            target_database_bytes,
            calculation_mode="actual",
        ),
        "historicalSnapshotBackfillMismatches": historical_backfill_mismatches,
        "tableCount": len(table_results),
        "sourceRowCount": sum(item["sourceCount"] for item in table_results),
        "targetRowCount": sum(item["targetCount"] for item in table_results),
        "tables": table_results,
    }


def _load_connection_urls() -> tuple[str, str]:
    source_dsn = os.environ.get("SOURCE_DATABASE_URL") or os.environ.get("DATABASE_URL")
    target_dsn = os.environ.get("TARGET_DATABASE_URL")
    if not source_dsn:
        raise MigrationError("Set SOURCE_DATABASE_URL (or DATABASE_URL) for the MySQL source")
    if not target_dsn:
        raise MigrationError("Set TARGET_DATABASE_URL for the PostgreSQL/Supabase target")
    if source_dsn == target_dsn:
        raise SafetyError("Source and target connection strings must be different")
    return source_dsn, target_dsn


def _load_repo_dotenv() -> None:
    """Load the repository .env without overriding an explicit process env."""

    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    repo_env = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    load_dotenv(dotenv_path=repo_env, override=False)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inventory, copy, and verify the Gana v9 MySQL-to-Supabase migration"
    )
    parser.add_argument(
        "--target-schema",
        default="public",
        help="Existing PostgreSQL schema to use (default: public)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=2_000,
        help="Streaming/COPY batch size (default: 2000)",
    )
    parser.add_argument(
        "--profile",
        choices=PROFILE_NAMES,
        default=PROFILE_FULL,
        help="Retention profile to inventory, copy, or verify (default: full)",
    )
    parser.add_argument(
        "--as-of",
        help=(
            "Fixed ISO-8601 UTC cutoff; required for --profile compact-free "
            "(example: 2026-07-14T17:00:00Z)"
        ),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    inventory_parser = subparsers.add_parser(
        "inventory", help="Compare source and target schema contracts"
    )
    inventory_parser.add_argument(
        "--replace-target",
        action="store_true",
        help=(
            "Read-only capacity projection that subtracts managed target tables; "
            "does not authorize COPY truncation"
        ),
    )
    copy_parser = subparsers.add_parser("copy", help="Copy all 33 domain tables")
    copy_parser.add_argument(
        "--truncate-target",
        action="store_true",
        help="Explicitly authorize truncating all 33 target tables before COPY",
    )
    subparsers.add_parser("verify", help="Compare table sets, counts, and canonical hashes")
    return parser


def run(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    as_of = parse_as_of(args.as_of, args.profile)
    source_dsn, target_dsn = _load_connection_urls()
    source_connection = None
    target_connection = None
    try:
        source_connection = connect_mysql(source_dsn)
        target_connection = connect_postgres(target_dsn)
        start_mysql_consistent_snapshot(source_connection)
        source_schema = discover_mysql_schema(source_connection)
        target_schema = discover_postgres_schema(target_connection, args.target_schema)
        profile = build_profile_plan(
            source_connection,
            source_schema,
            args.profile,
            as_of,
            args.batch_size,
        )

        if args.command == "inventory":
            target_database_bytes = _target_database_size(target_connection)
            target_managed_relation_bytes = _target_managed_relation_size(
                target_connection, args.target_schema
            )
            target_connection.rollback()
            document = inventory_document(
                source_schema,
                target_schema,
                profile,
                target_database_bytes,
                target_managed_relation_bytes,
                args.replace_target,
            )
            return document, 0 if document["status"] == "ready" else 2
        if args.command == "copy":
            document = copy_database(
                source_connection,
                target_connection,
                source_schema,
                target_schema,
                args.target_schema,
                args.batch_size,
                args.truncate_target,
                profile,
            )
            return document, 0
        if args.command == "verify":
            document = verify_database(
                source_connection,
                target_connection,
                source_schema,
                target_schema,
                args.target_schema,
                args.batch_size,
                profile,
            )
            return document, 0 if document["status"] == "verified" else 2
        raise ContractError(f"Unsupported command: {args.command}")
    finally:
        if target_connection is not None:
            target_connection.close()
        if source_connection is not None:
            source_connection.close()


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    _load_repo_dotenv()
    secrets: set[str] = set()
    for env_name in ("SOURCE_DATABASE_URL", "DATABASE_URL", "TARGET_DATABASE_URL"):
        secrets.update(_dsn_secret_values(os.environ.get(env_name)))
    try:
        document, exit_code = run(args)
    except BaseException as error:
        # No traceback: connector tracebacks can contain full connection params.
        document = {
            "version": 1,
            "command": getattr(args, "command", None),
            "status": "error",
            "privacy": {"containsRowData": False, "containsConnectionDetails": False},
            "error": {
                "type": type(error).__name__,
                "message": safe_exception_message(error, secrets),
            },
        }
        exit_code = 1
    emit_json(document, secrets)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
