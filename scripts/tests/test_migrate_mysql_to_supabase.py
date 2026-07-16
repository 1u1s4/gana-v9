from __future__ import annotations

import datetime as dt
import decimal
import importlib.util
import json
import pathlib
import re
import sys
import unittest
from collections import defaultdict


SCRIPT_PATH = pathlib.Path(__file__).parents[1] / "migrate_mysql_to_supabase.py"
SPEC = importlib.util.spec_from_file_location("migrate_mysql_to_supabase", SCRIPT_PATH)
assert SPEC and SPEC.loader
migration = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = migration
SPEC.loader.exec_module(migration)


def column(
    name: str,
    data_type: str = "text",
    native_type: str | None = None,
    *,
    nullable: bool = True,
    default_expression: str | None = None,
    ordinal: int = 1,
):
    return migration.ColumnInfo(
        name=name,
        data_type=data_type,
        native_type=native_type or data_type,
        nullable=nullable,
        ordinal=ordinal,
        default_expression=default_expression,
    )


def json_lineage_schema():
    quote_columns = [column("id", nullable=False)]
    quote_columns.extend(
        column(name, ordinal=index + 2)
        for index, name in enumerate(
            dict.fromkeys(
                (*migration.COMPACT_ODDS_QUOTE_DEDUPE_PARTITION, "captured_at")
            )
        )
    )
    return {
        "provider_snapshots": migration.TableInfo(
            name="provider_snapshots",
            columns=(column("id", nullable=False),),
            primary_key=("id",),
            foreign_keys=(),
        ),
        "odds_snapshots": migration.TableInfo(
            name="odds_snapshots",
            columns=(column("id", nullable=False),),
            primary_key=("id",),
            foreign_keys=(),
        ),
        "odds_quotes": migration.TableInfo(
            name="odds_quotes",
            columns=tuple(quote_columns),
            primary_key=("id",),
            foreign_keys=(),
        ),
        "source_records": migration.TableInfo(
            name="source_records",
            columns=(
                column("id", nullable=False),
                column("metadata", "json", ordinal=2),
                column("captured_at", "datetime", nullable=False, ordinal=3),
            ),
            primary_key=("id",),
            foreign_keys=(),
        ),
        "validation_artifacts": migration.TableInfo(
            name="validation_artifacts",
            columns=(
                column("id", nullable=False),
                column("metadata", "json", ordinal=2),
                column("evaluated_at", "datetime", nullable=False, ordinal=3),
            ),
            primary_key=("id",),
            foreign_keys=(),
        ),
    }


class JsonLineageConnection:
    def __init__(self):
        self.source_metadata = {
            "source-published": {
                "snapshotId": "provider-source",
                "oddsSnapshotId": "odds-source",
            }
        }
        self.validation_metadata = {
            "validation-published": b'{"resultProviderSnapshotId":"provider-result"}'
        }
        self.source_captured_at = {
            "source-published": dt.datetime(2026, 7, 14, 12, 0)
        }
        self.validation_evaluated_at = {
            "validation-published": dt.datetime(2026, 7, 14, 12, 0)
        }
        self.provider_snapshots = {"provider-source", "provider-result"}
        self.odds_snapshots = {"odds-source"}
        self.quotes_by_snapshot = {
            "odds-source": ("quote-a", "quote-b"),
            "prediction-snapshot": ("unrelated-prediction-quote",),
        }
        self.queries = []

    def cursor(self, **_kwargs):
        connection = self

        class Cursor:
            def __init__(self):
                self.rows = []
                self.done = False

            def execute(self, sql, params):
                params = tuple(params)
                connection.queries.append((sql, params))
                if (
                    "FROM `source_records`" in sql
                    and "`captured_at` >= %s" in sql
                ):
                    cutoff, as_of = params
                    self.rows = [
                        (key,)
                        for key, observed_at in connection.source_captured_at.items()
                        if cutoff <= observed_at <= as_of
                    ]
                elif (
                    "FROM `validation_artifacts`" in sql
                    and "`evaluated_at` >= %s" in sql
                ):
                    cutoff, as_of = params
                    self.rows = [
                        (key,)
                        for key, observed_at in connection.validation_evaluated_at.items()
                        if cutoff <= observed_at <= as_of
                    ]
                elif "FROM `source_records`" in sql:
                    self.rows = [
                        (key, connection.source_metadata[key])
                        for key in params
                        if key in connection.source_metadata
                    ]
                elif "FROM `validation_artifacts`" in sql:
                    self.rows = [
                        (key, connection.validation_metadata[key])
                        for key in params
                        if key in connection.validation_metadata
                    ]
                elif "FROM `provider_snapshots`" in sql:
                    self.rows = [
                        (key,) for key in params if key in connection.provider_snapshots
                    ]
                elif "FROM `odds_snapshots`" in sql:
                    self.rows = [
                        (key,) for key in params if key in connection.odds_snapshots
                    ]
                elif "FROM `odds_quotes`" in sql:
                    self.rows = [
                        (quote_id,)
                        for snapshot_id in params
                        for quote_id in connection.quotes_by_snapshot.get(snapshot_id, ())
                    ]

            def fetchmany(self, _size):
                if self.done:
                    return []
                self.done = True
                return self.rows

            def close(self):
                pass

        return Cursor()


def configure_json_lineage_case(
    connection: JsonLineageConnection,
    label: str,
    observed_at: dt.datetime,
) -> dict[str, tuple[str]]:
    source_key = f"source-{label}"
    validation_key = f"validation-{label}"
    provider_source = f"provider-source-{label}"
    provider_result = f"provider-result-{label}"
    odds_snapshot = f"odds-{label}"
    quote_a = f"quote-{label}-a"
    quote_b = f"quote-{label}-b"
    connection.source_metadata = {
        source_key: {
            "snapshotId": provider_source,
            "oddsSnapshotId": odds_snapshot,
        }
    }
    connection.validation_metadata = {
        validation_key: {"resultProviderSnapshotId": provider_result}
    }
    connection.source_captured_at = {source_key: observed_at}
    connection.validation_evaluated_at = {validation_key: observed_at}
    connection.provider_snapshots = {provider_source, provider_result}
    connection.odds_snapshots = {odds_snapshot}
    connection.quotes_by_snapshot = {odds_snapshot: (quote_a, quote_b)}
    return {
        "source_records": (source_key,),
        "validation_artifacts": (validation_key,),
        "provider_source": (provider_source,),
        "provider_result": (provider_result,),
        "odds_snapshot": (odds_snapshot,),
        "quote_a": (quote_a,),
        "quote_b": (quote_b,),
    }


class InMemoryClosureConnection:
    """Small MySQL cursor double for exact-key FK/JSON closure tests."""

    def __init__(self, rows_by_table):
        self.rows_by_table = rows_by_table
        self.queries = []

    def cursor(self, **_kwargs):
        connection = self

        class Cursor:
            def __init__(self):
                self.rows = []
                self.done = False

            def execute(self, sql, params):
                params = tuple(params)
                connection.queries.append((sql, params))
                match = re.fullmatch(
                    r"SELECT (?P<select>.+?) FROM `(?P<table>[^`]+)` "
                    r"WHERE (?P<where>.+?) ORDER BY .+",
                    sql,
                )
                if match is None:
                    raise AssertionError(f"Unsupported closure SQL: {sql}")
                selected_columns = re.findall(r"`([^`]+)`", match.group("select"))
                filter_columns = re.findall(r"`([^`]+)`", match.group("where"))
                if len(filter_columns) != 1:
                    raise AssertionError(f"Expected one filter column: {sql}")
                filter_column = filter_columns[0]
                requested = set(params)
                self.rows = [
                    tuple(row[name] for name in selected_columns)
                    for row in connection.rows_by_table.get(match.group("table"), ())
                    if row.get(filter_column) in requested
                ]

            def fetchmany(self, _size):
                if self.done:
                    return []
                self.done = True
                return self.rows

            def close(self):
                pass

        return Cursor()


class CanonicalizationTests(unittest.TestCase):
    def test_json_key_order_and_connector_number_types_hash_identically(self):
        json_column = column("payload", "jsonb")
        mysql_value = '{"z":0.10,"a":[2,1]}'
        postgres_value = {"a": [2, 1], "z": 0.1}

        self.assertEqual(
            migration.canonicalize_value(mysql_value, json_column),
            migration.canonicalize_value(postgres_value, json_column),
        )

    def test_decimal_scale_and_datetime_timezone_are_normalized(self):
        numeric_column = column("price", "numeric")
        datetime_column = column("created_at", "timestamp with time zone", "timestamptz")
        utc_minus_six = dt.timezone(dt.timedelta(hours=-6))

        left = migration.canonical_row_bytes(
            [decimal.Decimal("12.3400"), dt.datetime(2026, 7, 14, 6, 0)],
            [numeric_column, datetime_column],
        )
        right = migration.canonical_row_bytes(
            [decimal.Decimal("12.34"), dt.datetime(2026, 7, 14, 0, 0, tzinfo=utc_minus_six)],
            [numeric_column, datetime_column],
        )

        self.assertEqual(left, right)

    def test_binary_and_boolean_connector_representations_are_normalized(self):
        byte_column = column("blob", "bytea")
        bool_column = column("enabled", "boolean", "bool")
        self.assertEqual(
            migration.canonical_row_bytes([b"abc", 1], [byte_column, bool_column]),
            migration.canonical_row_bytes([memoryview(b"abc"), True], [byte_column, bool_column]),
        )

    def test_copy_csv_quotes_real_null_marker_but_not_null(self):
        encoded = migration._encode_copy_csv_row([None, r"\N", 'a"b', "line\nbreak"])
        self.assertEqual(encoded, '\\N,"\\N","a""b","line\nbreak"\n')

    def test_json_copy_preserves_decimal_precision(self):
        payload = {"probability": decimal.Decimal("0.1234567890123456789012345")}
        serialized = migration._serialize_json_for_storage(payload)
        self.assertEqual(
            serialized, '{"probability":0.1234567890123456789012345}'
        )

    def test_postgres_hash_cast_preserves_json_null_vs_sql_null(self):
        json_column = column("metadata", "jsonb")
        expression = migration._postgres_hash_select_expression(json_column)
        self.assertEqual(
            expression,
            'CASE WHEN "metadata" IS NULL THEN NULL ELSE "metadata"::text END AS "metadata"',
        )
        self.assertNotEqual(
            migration.canonicalize_value("null", json_column),
            migration.canonicalize_value(None, json_column),
        )


class TopologicalOrderTests(unittest.TestCase):
    def test_orders_parents_before_children_deterministically(self):
        order = migration.topological_order(
            {"legs", "runs", "parlays", "audit"},
            {
                "legs": {"parlays"},
                "parlays": {"runs"},
                "audit": {"runs"},
                "runs": set(),
            },
        )
        self.assertEqual(order, ["runs", "audit", "parlays", "legs"])

    def test_ignores_self_reference(self):
        self.assertEqual(
            migration.topological_order({"nodes"}, {"nodes": {"nodes"}}), ["nodes"]
        )

    def test_rejects_cross_table_cycles(self):
        with self.assertRaises(migration.ContractError):
            migration.topological_order({"a", "b"}, {"a": {"b"}, "b": {"a"}})


class SecretRedactionTests(unittest.TestCase):
    def test_removes_database_urls_and_password_assignments(self):
        source = "mysql://admin:s3cret@db.example:25060/gana_v9_ops_20260425?ssl-mode=REQUIRED"
        target = "postgresql://postgres:target-secret@db.supabase.co:5432/postgres"
        message = f"source={source} target={target} password=hunter2"
        redacted = migration.redact_secrets(
            message,
            migration._dsn_secret_values(source) | migration._dsn_secret_values(target),
        )
        for forbidden in (source, target, "s3cret", "target-secret", "hunter2"):
            self.assertNotIn(forbidden, redacted)
        self.assertIn("[REDACTED]", redacted)

    def test_recursively_sanitizes_json_output(self):
        value = {
            "error": "could not connect postgresql://u:p@host/db",
            "nested": ["pwd=unsafe"],
        }
        serialized = json.dumps(migration.sanitize_structure(value))
        self.assertNotIn("postgresql://", serialized)
        self.assertNotIn("unsafe", serialized)

    def test_suppresses_connector_context_that_could_contain_row_data(self):
        error = ValueError(
            'COPY failed for postgresql://u:p@host/db at row "private-prediction"'
        )
        message = migration.safe_exception_message(error)
        self.assertNotIn("private-prediction", message)
        self.assertNotIn("postgresql://", message)
        self.assertIn("suppressed", message)


class DomainContractTests(unittest.TestCase):
    def test_allow_list_contains_exactly_33_tables_and_all_gambeta_tables(self):
        self.assertEqual(len(migration.DOMAIN_TABLES), 33)
        self.assertTrue(
            {
                "gambeta_scrape_runs",
                "gambeta_pick_snapshots",
                "gambeta_current_picks",
                "gambeta_current_stats",
            }.issubset(migration.DOMAIN_TABLES)
        )
        self.assertNotIn("_prisma_migrations", migration.DOMAIN_TABLES)
        self.assertEqual(
            migration.TARGET_AUXILIARY_TABLES, frozenset({"provider_quota_daily"})
        )

    def test_target_auxiliary_table_is_not_schema_drift(self):
        tiny = migration.TableInfo(
            name="sports_providers",
            columns=(column("id", nullable=False),),
            primary_key=("id",),
            foreign_keys=(),
        )
        auxiliary = migration.TableInfo(
            name="provider_quota_daily",
            columns=(column("id", nullable=False),),
            primary_key=("id",),
            foreign_keys=(),
        )
        report = migration.schema_set_report(
            {"sports_providers": tiny},
            {"sports_providers": tiny, "provider_quota_daily": auxiliary},
        )
        self.assertEqual(report["targetUnexpected"], [])
        self.assertEqual(report["targetAuxiliaryTables"], ["provider_quota_daily"])

    def test_compact_policy_classifies_every_table_exactly_once(self):
        groups = [
            migration.COMPACT_FOREVER_TABLES,
            migration.COMPACT_REFERENCED_CATALOG_TABLES,
            migration.COMPACT_CURRENT_TABLES,
            frozenset(migration.COMPACT_RECENT_RULES),
            migration.COMPACT_DERIVED_ONLY_TABLES,
        ]
        self.assertEqual(frozenset().union(*groups), migration.DOMAIN_TABLES)
        self.assertEqual(sum(map(len, groups)), len(migration.DOMAIN_TABLES))

    def test_compact_policy_caps_history_and_raw_without_eternal_publications(self):
        self.assertEqual(migration.COMPACT_MAX_HISTORY_DAYS, 60)
        self.assertEqual(migration.COMPACT_RAW_RETENTION_DAYS, 7)
        self.assertEqual(
            migration.COMPACT_FREE_MAX_ESTIMATED_BYTES,
            330 * 1024 * 1024,
        )
        self.assertEqual(
            migration.COMPACT_EXACT_DEDUPE_PARTITIONS["odds_snapshots"],
            ("fixture_id",),
        )
        self.assertLessEqual(
            max(days for _, days in migration.COMPACT_RECENT_RULES.values()),
            migration.COMPACT_MAX_HISTORY_DAYS,
        )
        for table_name in (
            "provider_snapshots",
            "odds_snapshots",
            "provider_quota_samples",
        ):
            self.assertEqual(
                migration.COMPACT_RECENT_RULES[table_name][1],
                migration.COMPACT_RAW_RETENTION_DAYS,
            )
        for table_name in ("daily_metrics", "public_recommendation_publications"):
            self.assertNotIn(table_name, migration.COMPACT_FOREVER_TABLES)
            self.assertEqual(
                migration.COMPACT_RECENT_RULES[table_name][1],
                migration.COMPACT_MAX_HISTORY_DAYS,
            )
        for table_name in (
            "research_bundles",
            "source_records",
            "evidence_items",
            "claims",
        ):
            self.assertEqual(
                migration.COMPACT_RECENT_RULES[table_name][1],
                migration.COMPACT_RESEARCH_RETENTION_DAYS,
            )
        self.assertEqual(
            migration.COMPACT_RECENT_RULES["validation_artifacts"][1],
            migration.COMPACT_VALIDATION_RETENTION_DAYS,
        )
        for table_name in ("low_odds_scans", "low_odds_hits"):
            self.assertEqual(
                migration.COMPACT_RECENT_RULES[table_name][1],
                migration.COMPACT_TRANSIENT_RETENTION_DAYS,
            )
        self.assertIn(
            ("predictions", "validation_artifacts"),
            migration.COMPACT_DESCENDANT_RELATIONS,
        )
        for child_table in ("source_records", "evidence_items", "claims"):
            self.assertIn(
                ("research_bundles", child_table),
                migration.COMPACT_DESCENDANT_RELATIONS,
            )
        self.assertNotIn("competitions", migration.COMPACT_FOREVER_TABLES)
        self.assertNotIn("teams", migration.COMPACT_FOREVER_TABLES)
        self.assertEqual(
            migration.COMPACT_REFERENCED_CATALOG_TABLES,
            frozenset({"competitions", "teams"}),
        )
        self.assertIn("sports_providers", migration.COMPACT_FOREVER_TABLES)

    def test_large_payloads_are_short_lived_but_publication_metadata_is_retained(self):
        for table_name in (
            "claims",
            "evidence_items",
            "fixtures",
            "research_bundles",
            "source_records",
            "validation_artifacts",
        ):
            self.assertEqual(
                migration.COMPACT_BLOB_PRUNE_RULES[table_name][1],
                migration.COMPACT_PAYLOAD_RETENTION_DAYS,
            )
        self.assertEqual(
            migration.COMPACT_BLOB_PRUNE_RULES[
                "public_recommendation_publications"
            ][1],
            migration.COMPACT_MAX_HISTORY_DAYS,
        )


class CompactClosurePolicyTests(unittest.TestCase):
    @staticmethod
    def _fk(child, child_column, parent, constraint):
        return migration.ForeignKeyInfo(
            child_table=child,
            child_column=child_column,
            parent_table=parent,
            parent_column="id",
            constraint_name=constraint,
        )

    def test_referenced_catalog_parents_survive_but_orphans_are_excluded(self):
        fk = self._fk
        schema = {
            "sports_providers": migration.TableInfo(
                "sports_providers", (column("id", nullable=False),), ("id",), ()
            ),
            "competitions": migration.TableInfo(
                "competitions",
                (column("id", nullable=False), column("provider_id", ordinal=2)),
                ("id",),
                (
                    fk(
                        "competitions",
                        "provider_id",
                        "sports_providers",
                        "competition_provider_fk",
                    ),
                ),
            ),
            "teams": migration.TableInfo(
                "teams",
                (column("id", nullable=False), column("provider_id", ordinal=2)),
                ("id",),
                (fk("teams", "provider_id", "sports_providers", "team_provider_fk"),),
            ),
            "fixtures": migration.TableInfo(
                "fixtures",
                (
                    column("id", nullable=False),
                    column("provider_id", ordinal=2),
                    column("competition_id", ordinal=3),
                    column("home_team_id", ordinal=4),
                    column("away_team_id", ordinal=5),
                ),
                ("id",),
                (
                    fk("fixtures", "provider_id", "sports_providers", "fixture_provider_fk"),
                    fk("fixtures", "competition_id", "competitions", "fixture_competition_fk"),
                    fk("fixtures", "home_team_id", "teams", "fixture_home_team_fk"),
                    fk("fixtures", "away_team_id", "teams", "fixture_away_team_fk"),
                ),
            ),
            "league_presets": migration.TableInfo(
                "league_presets",
                (
                    column("id", nullable=False),
                    column("provider_id", ordinal=2),
                    column("competition_id", ordinal=3),
                ),
                ("id",),
                (
                    fk("league_presets", "provider_id", "sports_providers", "league_provider_fk"),
                    fk(
                        "league_presets",
                        "competition_id",
                        "competitions",
                        "league_competition_fk",
                    ),
                ),
            ),
            "team_presets": migration.TableInfo(
                "team_presets",
                (
                    column("id", nullable=False),
                    column("provider_id", ordinal=2),
                    column("team_id", ordinal=3),
                ),
                ("id",),
                (
                    fk("team_presets", "provider_id", "sports_providers", "preset_provider_fk"),
                    fk("team_presets", "team_id", "teams", "preset_team_fk"),
                ),
            ),
        }
        rows = {
            "sports_providers": [
                {"id": "provider-runtime"},
                {"id": "provider-unused"},
            ],
            "competitions": [
                {"id": "competition-fixture", "provider_id": "provider-runtime"},
                {"id": "competition-preset", "provider_id": "provider-runtime"},
                {"id": "competition-orphan", "provider_id": "provider-runtime"},
            ],
            "teams": [
                {"id": "team-home", "provider_id": "provider-runtime"},
                {"id": "team-away", "provider_id": "provider-runtime"},
                {"id": "team-preset", "provider_id": "provider-runtime"},
                {"id": "team-orphan", "provider_id": "provider-runtime"},
            ],
            "fixtures": [
                {
                    "id": "durable-fixture",
                    "provider_id": "provider-runtime",
                    "competition_id": "competition-fixture",
                    "home_team_id": "team-home",
                    "away_team_id": "team-away",
                }
            ],
            "league_presets": [
                {
                    "id": "league-preset",
                    "provider_id": "provider-runtime",
                    "competition_id": "competition-preset",
                }
            ],
            "team_presets": [
                {
                    "id": "team-preset-row",
                    "provider_id": "provider-runtime",
                    "team_id": "team-preset",
                }
            ],
        }
        connection = InMemoryClosureConnection(rows)
        retained = {name: set() for name in schema}
        retained["sports_providers"] = {
            ("provider-runtime",),
            ("provider-unused",),
        }
        retained["fixtures"] = {("durable-fixture",)}
        retained["league_presets"] = {("league-preset",)}
        retained["team_presets"] = {("team-preset-row",)}
        processed = {name: set() for name in schema}

        for _ in range(10):
            if migration._add_parent_closure(
                connection, schema, retained, processed, 100, True
            ) == 0:
                break
        else:  # pragma: no cover - regression guard
            self.fail("catalog FK closure did not converge")

        self.assertEqual(
            retained["competitions"],
            {("competition-fixture",), ("competition-preset",)},
        )
        self.assertEqual(
            retained["teams"],
            {("team-home",), ("team-away",), ("team-preset",)},
        )
        self.assertNotIn(("competition-orphan",), retained["competitions"])
        self.assertNotIn(("team-orphan",), retained["teams"])
        self.assertIn(("provider-unused",), retained["sports_providers"])
        self.assertEqual(
            migration._audit_compact_fk_closure(
                connection, schema, retained, 100
            ),
            [],
        )

    def _research_json_schema(self):
        schema = json_lineage_schema()
        schema["research_bundles"] = migration.TableInfo(
            "research_bundles", (column("id", nullable=False),), ("id",), ()
        )
        schema["source_records"] = migration.TableInfo(
            "source_records",
            (
                column("id", nullable=False),
                column("bundle_id", ordinal=2),
                column("metadata", "json", ordinal=3),
                column("captured_at", "datetime", nullable=False, ordinal=4),
            ),
            ("id",),
            (
                self._fk(
                    "source_records",
                    "bundle_id",
                    "research_bundles",
                    "source_bundle_fk",
                ),
            ),
        )
        return schema

    def test_old_non_durable_child_is_not_resurrected_by_recent_parent(self):
        schema = self._research_json_schema()
        rows = {
            "research_bundles": [{"id": "recent-bundle"}],
            "source_records": [
                {
                    "id": "old-source",
                    "bundle_id": "recent-bundle",
                    "metadata": {"snapshotId": "old-provider-snapshot"},
                    "captured_at": dt.datetime(2026, 6, 1),
                }
            ],
        }
        retained = {name: set() for name in schema}
        retained["research_bundles"].add(("recent-bundle",))
        eligible_json = {
            "source_records": set(),
            "validation_artifacts": set(),
        }
        added = migration._add_retained_structural_closure(
            InMemoryClosureConnection(rows),
            schema,
            retained,
            {name: set() for name in schema},
            {"source_records": set(), "validation_artifacts": set()},
            100,
            eligible_json,
        )
        self.assertEqual(added, 0)
        self.assertEqual(retained["source_records"], set())
        self.assertEqual(retained["provider_snapshots"], set())

    def test_durable_parent_keeps_descendant_and_closes_fk_and_json(self):
        schema = self._research_json_schema()
        rows = {
            "research_bundles": [{"id": "published-bundle"}],
            "source_records": [
                {
                    "id": "published-source",
                    "bundle_id": "published-bundle",
                    "metadata": {"snapshotId": "published-provider-snapshot"},
                    "captured_at": dt.datetime(2026, 5, 1),
                }
            ],
            "provider_snapshots": [{"id": "published-provider-snapshot"}],
        }
        connection = InMemoryClosureConnection(rows)
        durable = {name: set() for name in schema}
        durable["research_bundles"].add(("published-bundle",))
        processed_parents = {name: set() for name in schema}
        processed_descendants = defaultdict(set)
        processed_json = {
            "source_records": set(),
            "validation_artifacts": set(),
        }
        relation = {("research_bundles", "source_records")}
        self.assertTrue(relation.issubset(migration.COMPACT_DESCENDANT_RELATIONS))

        for _ in range(10):
            added = migration._add_parent_closure(
                connection,
                schema,
                durable,
                processed_parents,
                100,
                False,
            )
            added += migration._add_descendant_closure(
                connection,
                schema,
                durable,
                processed_descendants,
                100,
                relation,
            )
            added += migration._add_json_reference_closure(
                connection, schema, durable, processed_json, 100
            )
            if added == 0:
                break
        else:  # pragma: no cover - regression guard
            self.fail("durable closure did not converge")

        self.assertEqual(durable["source_records"], {("published-source",)})
        self.assertEqual(
            durable["provider_snapshots"],
            {("published-provider-snapshot",)},
        )
        self.assertEqual(
            migration._audit_compact_fk_closure(
                connection, schema, durable, 100
            ),
            [],
        )
        _, json_violations = migration._audit_compact_json_reference_closure(
            connection, schema, durable, 100
        )
        self.assertEqual(json_violations, [])


class DestinationExtensionTests(unittest.TestCase):
    def _table(self, name, columns):
        return migration.TableInfo(
            name=name,
            columns=tuple(columns),
            primary_key=("id",),
            foreign_keys=(),
        )

    def test_allows_only_named_destination_extensions_with_default_or_null(self):
        source = self._table("provider_snapshots", [column("id", nullable=False)])
        target = self._table(
            "provider_snapshots",
            [
                column("id", nullable=False),
                column("dedupe_key", nullable=True, ordinal=2),
                column(
                    "last_seen_at",
                    "timestamp with time zone",
                    "timestamptz",
                    nullable=False,
                    default_expression="now()",
                    ordinal=3,
                ),
                column(
                    "observation_count",
                    "integer",
                    "int4",
                    nullable=False,
                    default_expression="1",
                    ordinal=4,
                ),
            ],
        )
        report = migration.column_contract_report(
            {"provider_snapshots": source}, {"provider_snapshots": target}
        )
        self.assertEqual(report["mismatchCount"], 0)
        extension = report["allowedDestinationExtensions"][0]
        self.assertEqual(extension["fill"]["dedupe_key"], "NULL")
        self.assertEqual(extension["fill"]["last_seen_at"], "DEFAULT")

    def test_rejects_arbitrary_or_unfillable_destination_drift(self):
        source = self._table("odds_quotes", [column("id", nullable=False)])
        target = self._table(
            "odds_quotes",
            [
                column("id", nullable=False),
                column("unexpected_payload", nullable=True, ordinal=2),
                column("content_hash", nullable=False, ordinal=3),
            ],
        )
        report = migration.column_contract_report(
            {"odds_quotes": source}, {"odds_quotes": target}
        )
        self.assertEqual(report["mismatchCount"], 1)
        mismatch = report["mismatches"][0]
        self.assertEqual(mismatch["unsupportedTargetOnlyColumns"], ["unexpected_payload"])
        self.assertEqual(mismatch["unfillableTargetOnlyColumns"], ["content_hash"])

    def test_historical_snapshot_backfill_uses_capture_time_in_same_table(self):
        sql = migration.historical_snapshot_backfill_sql(
            "gana_ops", "provider_snapshots"
        )
        self.assertIn('UPDATE "gana_ops"."provider_snapshots"', sql)
        self.assertIn('"last_seen_at" = "captured_at"', sql)
        self.assertIn('"observation_count" = 1', sql)
        self.assertIn('"dedupe_key" IS NULL', sql)
        with self.assertRaises(migration.ContractError):
            migration.historical_snapshot_backfill_sql("gana_ops", "odds_quotes")


class ConnectionOptionTests(unittest.TestCase):
    def test_maps_prisma_accept_invalid_certs_without_forwarding_prisma_options(self):
        dsn = (
            "mysql://user:secret@db.example:25060/gana_v9_ops_20260425"
            "?sslaccept=accept_invalid_certs&connection_limit=5&pool_timeout=10"
        )
        options = migration._mysql_connection_options(dsn)
        self.assertFalse(options["ssl_disabled"])
        self.assertFalse(options["ssl_verify_cert"])
        self.assertFalse(options["ssl_verify_identity"])
        self.assertNotIn("sslaccept", options)
        self.assertNotIn("connection_limit", options)
        self.assertNotIn("pool_timeout", options)

    def test_pins_mysql_session_to_utc_before_consistent_snapshot(self):
        commands = []

        class Cursor:
            def execute(self, sql):
                commands.append(sql)

            def close(self):
                commands.append("CLOSE")

        class Connection:
            def cursor(self):
                return Cursor()

        migration.start_mysql_consistent_snapshot(Connection())
        self.assertEqual(
            commands,
            [
                "SET SESSION time_zone = '+00:00'",
                "SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ",
                "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
                "CLOSE",
            ],
        )


class ProfileSafetyTests(unittest.TestCase):
    def _plan(self, **overrides):
        values = {
            "name": migration.PROFILE_COMPACT_FREE,
            "as_of": dt.datetime(2026, 7, 14, 17, tzinfo=dt.timezone.utc),
            "selected_keys": {},
            "seed_counts": {},
            "closure_iterations": 1,
            "closure_added_rows": 0,
            "fk_violations": [],
            "table_estimates": [],
            "source_rows": 0,
            "selected_rows": 0,
            "estimated_source_bytes": 0,
            "estimated_target_bytes": 0,
        }
        values.update(overrides)
        return migration.ProfilePlan(**values)

    def test_requires_fixed_utc_as_of_for_compact_profile(self):
        with self.assertRaises(migration.ContractError):
            migration.parse_as_of(None, migration.PROFILE_COMPACT_FREE)
        with self.assertRaises(migration.ContractError):
            migration.parse_as_of("2026-07-14T17:00:00-06:00", migration.PROFILE_COMPACT_FREE)
        parsed = migration.parse_as_of(
            "2026-07-14T17:00:00Z", migration.PROFILE_COMPACT_FREE
        )
        self.assertEqual(parsed, dt.datetime(2026, 7, 14, 17, tzinfo=dt.timezone.utc))
        reference = migration.parse_as_of(
            "2026-07-14T17:27:32.834Z", migration.PROFILE_COMPACT_FREE
        )
        self.assertEqual(
            migration._format_as_of(reference), "2026-07-14T17:27:32.834Z"
        )

    def test_refuses_fk_open_or_over_budget_compact_profiles(self):
        with self.assertRaises(migration.SafetyError):
            migration.assert_profile_safe(
                self._plan(
                    fk_violations=[
                        {
                            "childTable": "predictions",
                            "parentTable": "fixtures",
                            "missingReferences": 1,
                        }
                    ]
                )
            )
        with self.assertRaises(migration.SafetyError):
            migration.assert_profile_safe(
                self._plan(
                    json_reference_violations=[
                        {
                            "childTable": "source_records",
                            "metadataKey": "oddsSnapshotId",
                            "parentTable": "odds_snapshots",
                            "missingReferences": 1,
                        }
                    ]
                )
            )
        with self.assertRaises(migration.SafetyError):
            migration.assert_profile_safe(
                self._plan(
                    estimated_target_bytes=(
                        migration.COMPACT_FREE_MAX_ESTIMATED_BYTES + 1
                    )
                )
            )

    def test_key_predicates_are_parameterized(self):
        sql, params = migration._mysql_key_predicate(
            ("id",), [("a",), ("b",)]
        )
        self.assertEqual(sql, "`id` IN (%s, %s)")
        self.assertEqual(params, ["a", "b"])

    def test_replacement_capacity_subtracts_only_managed_relations(self):
        mib = 1024 * 1024
        profile = self._plan(estimated_target_bytes=300 * mib)
        self.assertEqual(
            migration.projected_target_database_size(profile, 148 * mib),
            448 * mib,
        )
        self.assertEqual(
            migration.projected_target_database_size(
                profile,
                148 * mib,
                140 * mib,
                replace_target=True,
            ),
            308 * mib,
        )
        self.assertEqual(
            migration.projected_target_database_size(
                profile,
                148 * mib,
                200 * mib,
                replace_target=True,
            ),
            300 * mib,
        )
        document = migration.target_capacity_document(
            148 * mib,
            308 * mib,
            managed_relation_bytes=140 * mib,
            calculation_mode="replacement",
        )
        self.assertEqual(document["calculationMode"], "replacement")
        self.assertEqual(document["retainedDatabaseBytesBeforeEstimate"], 8 * mib)

    def test_inventory_replace_target_flag_changes_only_read_only_projection(self):
        mib = 1024 * 1024
        schema = {
            name: migration.TableInfo(
                name=name,
                columns=(column("id", nullable=False),),
                primary_key=("id",),
                foreign_keys=(),
            )
            for name in migration.DOMAIN_TABLES
        }
        profile = self._plan(estimated_target_bytes=300 * mib)
        append = migration.inventory_document(
            schema, schema, profile, 148 * mib, 140 * mib, False
        )
        replacement = migration.inventory_document(
            schema, schema, profile, 148 * mib, 140 * mib, True
        )
        self.assertEqual(append["status"], "mismatch")
        self.assertEqual(append["targetCapacity"]["calculationMode"], "append")
        self.assertFalse(append["replaceTargetProjection"])
        self.assertEqual(replacement["status"], "ready")
        self.assertEqual(
            replacement["targetCapacity"]["calculationMode"], "replacement"
        )
        self.assertTrue(replacement["replaceTargetProjection"])

        args = migration._build_parser().parse_args(
            [
                "--profile",
                "compact-free",
                "--as-of",
                "2026-07-14T17:00:00Z",
                "inventory",
                "--replace-target",
            ]
        )
        self.assertTrue(args.replace_target)
        self.assertEqual(args.command, "inventory")

    def test_managed_relation_size_counts_only_domain_and_auxiliary_tables(self):
        observed = {}

        class Cursor:
            def execute(self, sql, params):
                observed["sql"] = sql
                observed["params"] = params

            def fetchone(self):
                return (123456,)

            def close(self):
                pass

        class Connection:
            def cursor(self):
                return Cursor()

        self.assertEqual(
            migration._target_managed_relation_size(Connection(), "gana_ops"),
            123456,
        )
        self.assertIn("pg_total_relation_size", observed["sql"])
        self.assertEqual(observed["params"][0], "gana_ops")
        self.assertEqual(
            set(observed["params"][1]),
            migration.DOMAIN_TABLES | migration.TARGET_AUXILIARY_TABLES,
        )

    def test_recent_odds_query_keeps_latest_snapshot_per_fixture(self):
        class Cursor:
            def __init__(self):
                self.sql = ""
                self.params = ()
                self.done = False

            def execute(self, sql, params):
                self.sql = sql
                self.params = params

            def fetchmany(self, _size):
                if self.done:
                    return []
                self.done = True
                return [("latest-id",)]

            def close(self):
                pass

        class Connection:
            def __init__(self):
                self.last_cursor = None

            def cursor(self, **_kwargs):
                self.last_cursor = Cursor()
                return self.last_cursor

        table = migration.TableInfo(
            name="odds_snapshots",
            columns=(
                column("id", nullable=False),
                column("fixture_id", ordinal=2),
                column("payload_hash", ordinal=3),
                column("captured_at", ordinal=4),
            ),
            primary_key=("id",),
            foreign_keys=(),
        )
        connection = Connection()
        keys = migration._select_recent_deduped_keys(
            connection,
            table,
            migration.COMPACT_EXACT_DEDUPE_PARTITIONS["odds_snapshots"],
            "captured_at",
            dt.datetime(2026, 6, 30),
            dt.datetime(2026, 7, 14),
            100,
        )
        self.assertEqual(keys, {("latest-id",)})
        self.assertIn(
            "PARTITION BY `fixture_id`", connection.last_cursor.sql
        )
        self.assertNotIn("PARTITION BY `fixture_id`, `payload_hash`", connection.last_cursor.sql)
        self.assertIn("`captured_at` DESC, `id` DESC", connection.last_cursor.sql)

    def test_required_prediction_adds_its_nonlatest_snapshot_during_parent_closure(self):
        class Cursor:
            def __init__(self):
                self.done = False

            def execute(self, sql, _params):
                self.sql = sql

            def fetchmany(self, _size):
                if self.done:
                    return []
                self.done = True
                if "FROM `predictions`" in self.sql:
                    return [("prediction", "referenced-historical-snapshot")]
                return []

            def close(self):
                pass

        class Connection:
            def cursor(self, **_kwargs):
                return Cursor()

        snapshots = migration.TableInfo(
            name="odds_snapshots",
            columns=(column("id", nullable=False),),
            primary_key=("id",),
            foreign_keys=(),
        )
        predictions = migration.TableInfo(
            name="predictions",
            columns=(
                column("id", nullable=False),
                column("odds_snapshot_id", nullable=False, ordinal=2),
            ),
            primary_key=("id",),
            foreign_keys=(
                migration.ForeignKeyInfo(
                    child_table="predictions",
                    child_column="odds_snapshot_id",
                    parent_table="odds_snapshots",
                    parent_column="id",
                    constraint_name="predictions_odds_snapshot_fk",
                ),
            ),
        )
        retained = {
            "odds_snapshots": {("latest-raw-snapshot",)},
            "predictions": {("prediction",)},
        }
        processed = {"odds_snapshots": set(), "predictions": set()}
        added = migration._add_parent_closure(
            Connection(),
            {"odds_snapshots": snapshots, "predictions": predictions},
            retained,
            processed,
            100,
            True,
        )
        self.assertEqual(added, 1)
        self.assertEqual(
            retained["odds_snapshots"],
            {
                ("latest-raw-snapshot",),
                ("referenced-historical-snapshot",),
            },
        )

    def test_quote_dedupe_is_scoped_to_selected_snapshots_and_business_content(self):
        class Cursor:
            def __init__(self):
                self.sql = ""
                self.params = ()
                self.done = False

            def execute(self, sql, params):
                self.sql = sql
                self.params = params

            def fetchmany(self, _size):
                if self.done:
                    return []
                self.done = True
                return [("latest-quote",)]

            def close(self):
                pass

        class Connection:
            def __init__(self):
                self.cursors = []

            def cursor(self, **_kwargs):
                cursor = Cursor()
                self.cursors.append(cursor)
                return cursor

        columns = [column("id", nullable=False)]
        columns.extend(
            column(name, ordinal=index + 2)
            for index, name in enumerate(
                dict.fromkeys(
                    (*migration.COMPACT_ODDS_QUOTE_DEDUPE_PARTITION, "captured_at")
                )
            )
        )
        table = migration.TableInfo(
            name="odds_quotes",
            columns=tuple(columns),
            primary_key=("id",),
            foreign_keys=(),
        )
        connection = Connection()
        keys = migration._select_deduped_odds_quote_keys(
            connection, table, {("snapshot-a",), ("snapshot-b",)}, 100
        )
        self.assertEqual(keys, {("latest-quote",)})
        cursor = connection.cursors[0]
        self.assertIn("WHERE `snapshot_id` IN (%s, %s)", cursor.sql)
        self.assertIn("PARTITION BY `snapshot_id`, `fixture_id`", cursor.sql)
        self.assertIn("`captured_at` DESC, `id` DESC", cursor.sql)
        self.assertEqual(set(cursor.params), {"snapshot-a", "snapshot-b"})

    def test_json_lineage_closure_selects_exact_parents_and_narrow_quotes(self):
        connection = JsonLineageConnection()
        schema = json_lineage_schema()
        retained = defaultdict(set)
        retained["source_records"].add(("source-published",))
        retained["validation_artifacts"].add(("validation-published",))
        processed = {
            "source_records": set(),
            "validation_artifacts": set(),
        }

        added = migration._add_json_reference_closure(
            connection, schema, retained, processed, 100
        )
        self.assertEqual(added, 5)
        self.assertEqual(
            retained["provider_snapshots"],
            {("provider-source",), ("provider-result",)},
        )
        self.assertEqual(retained["odds_snapshots"], {("odds-source",)})
        self.assertEqual(retained["odds_quotes"], {("quote-a",), ("quote-b",)})
        self.assertEqual(
            migration._add_json_reference_closure(
                connection, schema, retained, processed, 100
            ),
            0,
        )

        stats, violations = migration._audit_compact_json_reference_closure(
            connection, schema, retained, 100
        )
        self.assertEqual(violations, [])
        self.assertTrue(all(item.get("missingDistinctParents", 0) == 0 for item in stats))
        quote_stat = next(
            item for item in stats if item["edgeType"] == "json-odds-snapshot-quotes"
        )
        self.assertEqual(quote_stat["referencedSnapshotCount"], 1)
        self.assertEqual(quote_stat["expectedDedupedQuotes"], 2)
        quote_queries = [
            params
            for sql, params in connection.queries
            if "FROM `odds_quotes`" in sql
        ]
        self.assertTrue(quote_queries)
        self.assertTrue(all(set(params) == {"odds-source"} for params in quote_queries))

    def test_old_non_durable_json_metadata_does_not_expand_lineage(self):
        connection = JsonLineageConnection()
        schema = json_lineage_schema()
        as_of = dt.datetime(2026, 7, 14, 17, tzinfo=dt.timezone.utc)
        keys = configure_json_lineage_case(
            connection,
            "old",
            dt.datetime(2026, 7, 7, 16, 59),
        )
        durable = defaultdict(set)
        eligible = migration._select_json_materialized_child_keys(
            connection, schema, as_of, durable, 100
        )
        self.assertNotIn(keys["source_records"], eligible["source_records"])
        self.assertNotIn(
            keys["validation_artifacts"], eligible["validation_artifacts"]
        )

        retained = defaultdict(set)
        retained["source_records"].add(keys["source_records"])
        retained["validation_artifacts"].add(keys["validation_artifacts"])
        processed = {
            "source_records": set(),
            "validation_artifacts": set(),
        }
        added = migration._add_json_reference_closure(
            connection, schema, retained, processed, 100, eligible
        )
        self.assertEqual(added, 0)
        self.assertEqual(retained["provider_snapshots"], set())
        self.assertEqual(retained["odds_snapshots"], set())
        self.assertEqual(retained["odds_quotes"], set())

        stats, violations = migration._audit_compact_json_reference_closure(
            connection, schema, retained, 100, eligible
        )
        self.assertEqual(violations, [])
        parent_stats = [item for item in stats if item["edgeType"] == "json-parent"]
        self.assertTrue(all(item["retainedChildRows"] == 1 for item in parent_stats))
        self.assertTrue(all(item["materializedChildRows"] == 0 for item in parent_stats))
        self.assertTrue(all(item["distinctReferences"] == 0 for item in parent_stats))

    def test_hot_json_metadata_expands_exact_lineage(self):
        connection = JsonLineageConnection()
        schema = json_lineage_schema()
        as_of = dt.datetime(2026, 7, 14, 17, tzinfo=dt.timezone.utc)
        keys = configure_json_lineage_case(
            connection,
            "hot",
            dt.datetime(2026, 7, 7, 17, 0),
        )
        eligible = migration._select_json_materialized_child_keys(
            connection, schema, as_of, defaultdict(set), 100
        )
        self.assertIn(keys["source_records"], eligible["source_records"])
        self.assertIn(
            keys["validation_artifacts"], eligible["validation_artifacts"]
        )

        retained = defaultdict(set)
        retained["source_records"].add(keys["source_records"])
        retained["validation_artifacts"].add(keys["validation_artifacts"])
        processed = {
            "source_records": set(),
            "validation_artifacts": set(),
        }
        self.assertEqual(
            migration._add_json_reference_closure(
                connection, schema, retained, processed, 100, eligible
            ),
            5,
        )
        self.assertEqual(
            retained["provider_snapshots"],
            {keys["provider_source"], keys["provider_result"]},
        )
        self.assertEqual(retained["odds_snapshots"], {keys["odds_snapshot"]})
        self.assertEqual(
            retained["odds_quotes"], {keys["quote_a"], keys["quote_b"]}
        )

    def test_old_durable_json_metadata_still_expands_exact_lineage(self):
        connection = JsonLineageConnection()
        schema = json_lineage_schema()
        as_of = dt.datetime(2026, 7, 14, 17, tzinfo=dt.timezone.utc)
        keys = configure_json_lineage_case(
            connection,
            "durable",
            dt.datetime(2026, 5, 15, 17, 0),
        )
        durable = defaultdict(set)
        durable["source_records"].add(keys["source_records"])
        durable["validation_artifacts"].add(keys["validation_artifacts"])
        eligible = migration._select_json_materialized_child_keys(
            connection, schema, as_of, durable, 100
        )
        self.assertIn(keys["source_records"], eligible["source_records"])
        self.assertIn(
            keys["validation_artifacts"], eligible["validation_artifacts"]
        )

        retained = defaultdict(set)
        retained["source_records"].add(keys["source_records"])
        retained["validation_artifacts"].add(keys["validation_artifacts"])
        processed = {
            "source_records": set(),
            "validation_artifacts": set(),
        }
        self.assertEqual(
            migration._add_json_reference_closure(
                connection, schema, retained, processed, 100, eligible
            ),
            5,
        )
        self.assertEqual(
            retained["provider_snapshots"],
            {keys["provider_source"], keys["provider_result"]},
        )
        self.assertEqual(retained["odds_snapshots"], {keys["odds_snapshot"]})
        self.assertEqual(
            retained["odds_quotes"], {keys["quote_a"], keys["quote_b"]}
        )

    def test_durable_json_lineage_protects_snapshot_and_quote_payloads(self):
        connection = JsonLineageConnection()
        schema = json_lineage_schema()
        durable = defaultdict(set)
        durable["source_records"].add(("source-published",))
        durable["validation_artifacts"].add(("validation-published",))
        processed = {
            "source_records": set(),
            "validation_artifacts": set(),
        }
        migration._add_json_reference_closure(
            connection, schema, durable, processed, 100
        )

        protected = migration._build_protected_column_keys(
            connection,
            schema,
            {"predictions": set()},
            durable,
            100,
        )
        self.assertEqual(
            protected["odds_quotes.metadata"], {("quote-a",), ("quote-b",)}
        )
        for column_name in ("quota_metadata", "request_metadata", "raw_payload"):
            self.assertEqual(
                protected[f"provider_snapshots.{column_name}"],
                {("provider-source",), ("provider-result",)},
            )
        self.assertEqual(
            protected["odds_snapshots.metadata"], {("odds-source",)}
        )

    def test_json_lineage_audit_reports_counts_without_row_ids(self):
        connection = JsonLineageConnection()
        schema = json_lineage_schema()
        retained = defaultdict(set)
        retained["source_records"].add(("source-published",))
        retained["validation_artifacts"].add(("validation-published",))
        processed = {
            "source_records": set(),
            "validation_artifacts": set(),
        }
        migration._add_json_reference_closure(
            connection, schema, retained, processed, 100
        )
        retained["provider_snapshots"].discard(("provider-result",))
        retained["odds_quotes"].discard(("quote-b",))

        stats, violations = migration._audit_compact_json_reference_closure(
            connection, schema, retained, 100
        )
        self.assertEqual(sum(item["missingReferences"] for item in violations), 2)
        self.assertEqual(
            sum(item.get("missingDistinctParents", 0) for item in stats), 1
        )
        serialized = json.dumps({"stats": stats, "violations": violations})
        self.assertNotIn("provider-result", serialized)
        self.assertNotIn("quote-b", serialized)

    def test_compact_transform_nulls_only_prunable_optional_fk_and_metadata(self):
        quote = migration.TableInfo(
            name="odds_quotes",
            columns=(column("id", nullable=False), column("metadata", "json", ordinal=2)),
            primary_key=("id",),
            foreign_keys=(),
        )
        hit = migration.TableInfo(
            name="low_odds_hits",
            columns=(
                column("id", nullable=False),
                column("odds_quote_id", nullable=True, ordinal=2),
            ),
            primary_key=("id",),
            foreign_keys=(
                migration.ForeignKeyInfo(
                    child_table="low_odds_hits",
                    child_column="odds_quote_id",
                    parent_table="odds_quotes",
                    parent_column="id",
                    constraint_name="hit_quote_fk",
                ),
            ),
        )
        plan = self._plan(
            selected_keys={"odds_quotes": {("kept",)}, "low_odds_hits": {("h1",)}},
            protected_column_keys={"odds_quotes.metadata": {("kept",)}},
        )
        transformed_hit = migration._transform_row_for_profile(
            ("h1", "dropped"), hit, {"odds_quotes": quote, "low_odds_hits": hit}, plan
        )
        self.assertEqual(transformed_hit, ("h1", None))
        kept_quote = migration._transform_row_for_profile(
            ("kept", '{"x":1}'), quote, {"odds_quotes": quote}, plan
        )
        dropped_metadata = migration._transform_row_for_profile(
            ("other", '{"x":1}'), quote, {"odds_quotes": quote}, plan
        )
        self.assertEqual(kept_quote[1], '{"x":1}')
        self.assertIsNone(dropped_metadata[1])

    def test_compact_transform_prunes_old_raw_payload_but_keeps_core_fields(self):
        table = migration.TableInfo(
            name="provider_snapshots",
            columns=(
                column("id", nullable=False),
                column("captured_at", "datetime", ordinal=2),
                column("endpoint_name", ordinal=3),
                column("quota_metadata", "json", ordinal=4),
                column("request_metadata", "json", ordinal=5),
                column("raw_payload", "json", ordinal=6),
            ),
            primary_key=("id",),
            foreign_keys=(),
        )
        plan = self._plan(
            as_of=dt.datetime(2026, 7, 14, 17, tzinfo=dt.timezone.utc),
            selected_keys={"provider_snapshots": {("snapshot",)}},
        )
        transformed = migration._transform_row_for_profile(
            (
                "snapshot",
                dt.datetime(2026, 7, 7, 16, 59),
                "fixtures",
                '{"remaining":1}',
                '{"request":1}',
                '{"large":true}',
            ),
            table,
            {"provider_snapshots": table},
            plan,
        )
        self.assertEqual(
            transformed[:3],
            ("snapshot", dt.datetime(2026, 7, 7, 16, 59), "fixtures"),
        )
        self.assertEqual(transformed[3:], (None, None, None))

    def test_compact_transform_prunes_evidence_payload_but_keeps_lineage_and_kind(self):
        table = migration.TableInfo(
            name="evidence_items",
            columns=(
                column("id", nullable=False),
                column("bundle_id", ordinal=2),
                column("source_id", ordinal=3),
                column("kind", ordinal=4),
                column("snippet_redacted", ordinal=5),
                column("summary_redacted", ordinal=6),
                column("claim_ids", "json", ordinal=7),
                column("warnings", "json", ordinal=8),
                column("metadata", "json", ordinal=9),
                column("created_at", "datetime", ordinal=10),
            ),
            primary_key=("id",),
            foreign_keys=(),
        )
        plan = self._plan(
            as_of=dt.datetime(2026, 7, 14, 17, tzinfo=dt.timezone.utc),
            selected_keys={"evidence_items": {("evidence",)}},
        )
        transformed = migration._transform_row_for_profile(
            (
                "evidence",
                "bundle",
                "source",
                "injury-report",
                "large snippet",
                "large summary",
                '["claim"]',
                '["warning"]',
                '{"large":true}',
                dt.datetime(2026, 7, 7, 16, 59),
            ),
            table,
            {"evidence_items": table},
            plan,
        )
        self.assertEqual(
            transformed[:4],
            ("evidence", "bundle", "source", "injury-report"),
        )
        self.assertEqual(transformed[4:9], (None, None, None, None, None))
        self.assertEqual(transformed[9], dt.datetime(2026, 7, 7, 16, 59))

    def test_durable_publication_lineage_protects_optional_payloads(self):
        durable = defaultdict(set)
        durable["evidence_items"].add(("published-evidence",))
        protected = migration._build_protected_column_keys(
            None,
            {},
            {"predictions": set()},
            durable,
            100,
        )
        for column_name in (
            "snippet_redacted",
            "summary_redacted",
            "claim_ids",
            "warnings",
            "metadata",
        ):
            self.assertEqual(
                protected[f"evidence_items.{column_name}"],
                {("published-evidence",)},
            )

    def test_profile_document_exposes_versioned_retention_contract_without_stale_baseline(self):
        document = migration.profile_document(self._plan())
        self.assertEqual(document["policyVersion"], migration.COMPACT_POLICY_VERSION)
        self.assertEqual(
            document["policyVersion"],
            "compact-free-v6-60d-history-7d-raw-json-lineage-"
            "referenced-catalogs-retention-fixed-point",
        )
        self.assertEqual(document["retention"]["rawDays"], 7)
        self.assertEqual(document["retention"]["maximumHistoryDays"], 60)
        self.assertEqual(document["retention"]["researchDays"], 14)
        self.assertEqual(document["retention"]["validationDays"], 14)
        self.assertEqual(document["retention"]["largePayloadDays"], 7)
        self.assertIn(
            "json-referenced-with-narrow-quotes",
            document["retention"]["rawOddsSnapshotPolicy"],
        )
        self.assertIn(
            "selected-only-by-retained-foreign-keys",
            document["retention"]["referencedCatalogPolicy"],
        )
        self.assertIn(
            "time-window-seeds",
            document["retention"]["nonDurableDescendantPolicy"],
        )
        self.assertTrue(document["jsonReferenceClosed"])
        self.assertEqual(document["jsonReferenceViolations"], [])
        self.assertIsNone(document["referenceBaseline"])


if __name__ == "__main__":
    unittest.main()
