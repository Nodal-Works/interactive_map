#!/usr/bin/env python3
"""Export the interactive map footprints with EPC summary data.

The EPC Browser database must already contain the enriched Gothenburg
footprints table. The output is intentionally a compact public artifact,
not a copy of the full EPC database.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any
import duckdb

EPC_FIELDS = [
    "IdAdr",
    "IdPostnr",
    "IdPostort",
    "IdKommun",
    "EgenByggnadsKat",
    "EgenByggnadsTyp",
    "EgenNybyggAr",
    "EgenAtemp",
    "EgenBOA",
    "EgenLOA",
    "EgenBRA",
    "EgenBTA",
    "EgenAntalPlan",
    "EgenAntalKallarplan",
    "EgenAntalTrapphus",
    "EgenAntalBolgh",
    "EgenProjVentFlode",
    "EgenInstEleffektStorre",
    "EgenSkyddadEllerVardefull",
    "EgiEnergiklass",
    "EgiEnergiPrestanda",
    "EgiSpecifikEnergianvandning",
    "EgiEnergianvandning",
    "EgiPrimarenergianvandning",
    "EgiPrimarenergital2020",
    "EgiVaravEl",
    "EgiForstaArManad",
    "EgiSistaArManad",
    "EgiBeraknatVarde",
    "EgiFjarrvarme",
    "EgiOlja",
    "EgiGas",
    "EgiVed",
    "EgiElVatten",
    "EgiElDirekt",
    "EgiElLuft",
    "EgiPumpMark",
    "EgiPumpFranluft",
    "EgiPumpLuftLuft",
    "EgiPumpLuftVatten",
    "EgiSolcell",
    "EgiSolvarme",
    "VentTypFTX",
    "VentTypF",
    "VentTypFT",
    "VentTypSjalvdrag",
    "VentTypFmed",
    "VentGruppKrav",
    "EgiSumma1",
    "EgiSumma2",
    "EgiSumma3",
    "EgiSumma4",
    "EgiVVBered",
    "EgiFjarrkyla",
    "EgiBerElProduktion",
    "EgiFastighet",
    "EgiVerksamhet",
    "EgiKomfortTillagg",
    "EgiStationEI",
    "EgiNormKorrEI",
    "EgiRefvarde1",
    "EgiRefvarde2Min",
    "EgiRefvarde2Max",
    "EgiVersion",
    "VentGruppGodkand",
    "RadGruppHaltMatt",
    "RadHalt",
    "RadTypMatning",
    "RadMatDatum",
    "Godkand",
    "Version",
    "ExpertBehorighet",
    "VentDelvisProcent",
    "VentGruppUtanAnm",
    "InspUppvGruppInspSkyldighet",
    "InspUppvUndAvtalEgipres",
    "InspLuftGruppInspSkyldighet",
    "InspLuftUndAvtalEgipres",
    "AtgForslagEgiMinskad",
    "AtgForslagKostnad",
    "AtgForslagCO2",
    "AtgUtfordaUtfortAr",
    "AtgUtfordaEgiMinskad",
]


def json_value(value: Any) -> Any:
    """Convert database values to JSON-safe values."""
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--map-file",
        type=Path,
        default=Path("media/building-footprints.geojson"),
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("../chalmers_epc_browser/epc_sweden.duckdb"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("media/building-footprints-epc.geojson"),
    )
    args = parser.parse_args()

    map_data = json.loads(args.map_file.read_text())
    features = map_data.get("features", [])
    identities = [feature.get("properties", {}).get("objektidentitet") for feature in features]
    identities = [identity for identity in identities if identity]
    if not identities:
        raise SystemExit("No objektidentitet values found in the map GeoJSON")

    database = duckdb.connect(str(args.database.resolve()), read_only=True)
    try:
        columns = {row[0] for row in database.execute("DESCRIBE epc").fetchall()}
        selected_fields = [field for field in EPC_FIELDS if field in columns]
        select_fields = ", ".join(f'e."{field}"' for field in selected_fields)
        placeholders = ", ".join("?" for _ in identities)
        query = f'''
            SELECT f.objektidentitet, f."FormularId", f.fastighetsbeteckning,
                   {select_fields}
            FROM footprints_gothenburg f
            LEFT JOIN epc e ON e."FormularId" = f."FormularId"
            WHERE f.objektidentitet IN ({placeholders})
        '''
        rows = database.execute(query, identities).fetchall()
        result_columns = [description[0] for description in database.description]
    finally:
        database.close()

    by_identity: dict[str, dict[str, Any]] = {}
    for row in rows:
        record = {key: json_value(value) for key, value in zip(result_columns, row)}
        identity = record.pop("objektidentitet")
        by_identity[identity] = record

    matched = 0
    linked = 0
    output_features = []
    for feature in features:
        properties = dict(feature.get("properties") or {})
        identity = properties.get("objektidentitet")
        record = by_identity.get(identity)
        if record is not None:
            matched += 1
            joined_record = dict(record)
            formular_id = joined_record.pop("FormularId", None)
            property_designation = joined_record.pop("fastighetsbeteckning", None)
            detail = {key: value for key, value in joined_record.items() if value is not None}
            properties.update(
                {
                    "FormularId": formular_id,
                    "fastighetsbeteckning": property_designation,
                    "energy_class": detail.get("EgiEnergiklass"),
                    "energy_performance": detail.get("EgiEnergiPrestanda"),
                    "specific_energy": detail.get("EgiSpecifikEnergianvandning"),
                    "building_category": detail.get("EgenByggnadsKat"),
                    "construction_year": detail.get("EgenNybyggAr"),
                    "epc_detail": detail,
                }
            )
            if formular_id is not None:
                linked += 1
        else:
            properties.update(
                {
                    "FormularId": None,
                    "energy_class": None,
                    "energy_performance": None,
                    "specific_energy": None,
                    "building_category": None,
                    "construction_year": None,
                    "epc_detail": {},
                }
            )
        output_features.append(
            {
                "type": feature.get("type", "Feature"),
                "geometry": feature.get("geometry"),
                "properties": properties,
            }
        )

    output = {
        "type": "FeatureCollection",
        "name": "building-footprints-epc",
        "metadata": {
            "source_map": str(args.map_file),
            "source_database": str(args.database),
            "matched_footprints": matched,
            "linked_epc": linked,
            "unmatched_footprints": len(features) - matched,
        },
        "features": output_features,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=True, separators=(",", ":")))
    print(
        f"Exported {len(features)} features: {matched} matched to Gothenburg footprints, "
        f"{linked} linked to EPC, {len(features) - matched} unmatched -> {args.output}"
    )


if __name__ == "__main__":
    main()
