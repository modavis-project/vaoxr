#!/usr/bin/env python3
"""Repository-neutral VAO 0.5.0 projections for adjacent standards."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import vao05

RO_CRATE_CONTEXT = "https://w3id.org/ro/crate/1.3/context"
RO_CRATE_PROFILE = "https://w3id.org/ro/crate/1.3"


def _label(value: dict[str, str]) -> str:
    return value.get("en") or value.get("und") or next(iter(value.values()))


def _require_valid(manifest: dict[str, Any]) -> None:
    report = vao05.validate_manifest(manifest)
    if not report["valid"]:
        raise ValueError(
            "Cannot project an invalid VAO 0.5.0 manifest: "
            + "; ".join(report["errors"][:3])
        )


def ro_crate(manifest: dict[str, Any]) -> dict[str, Any]:
    _require_valid(manifest)
    publication_year = manifest["discovery"].get("publicationYear")
    if publication_year is None:
        raise ValueError(
            "RO-Crate projection requires discovery.publicationYear; "
            "VAO modifiedAt is not a publication date"
        )
    assets = {record["id"]: record for record in manifest["logicalAssets"]}
    activities = manifest["scientific"]["activities"]
    root_scope = {manifest["id"], manifest["release"]["id"]}
    root_rights = [
        record
        for record in manifest["rights"]
        if root_scope & set(record["appliesToIds"])
    ]
    if not root_rights:
        raise ValueError(
            "RO-Crate projection requires a Rights record applying to the VAO or release"
        )
    root = {
        "@id": "./",
        "@type": "Dataset",
        "name": _label(manifest["title"]),
        "description": _label(manifest.get("description", manifest["title"])),
        "identifier": manifest["id"],
        "version": manifest["release"]["contentVersion"],
        "dateCreated": manifest["createdAt"],
        "dateModified": manifest["modifiedAt"],
        "datePublished": str(publication_year),
        "conformsTo": [{"@id": value} for value in manifest["conformsTo"]],
        "creator": [
            {"@id": value} for value in manifest["discovery"]["creatorAgentIds"]
        ],
        "license": [{"@id": record["id"]} for record in root_rights],
        "hasPart": [{"@id": record["id"]} for record in manifest["realizations"]],
        "mentions": [{"@id": record["id"]} for record in activities],
    }
    graph: list[dict[str, Any]] = [
        {
            "@id": "ro-crate-metadata.json",
            "@type": "CreativeWork",
            "about": {"@id": "./"},
            "conformsTo": {"@id": RO_CRATE_PROFILE},
        },
        root,
    ]
    for profile in manifest["profiles"]:
        graph.append(
            {
                "@id": profile["id"],
                "@type": ["CreativeWork", "Profile"],
                "name": f"VAO {profile['id'].split('/')[-2]} profile",
                "version": profile["version"],
            }
        )
    for rights in manifest["rights"]:
        entity = {
            "@id": rights["id"],
            "@type": "CreativeWork",
            "name": "VAO rights and license declaration",
            "description": _label(rights["statement"]),
        }
        if rights.get("license"):
            entity["sameAs"] = {"@id": rights["license"]}
        if rights.get("attribution"):
            entity["creditText"] = rights["attribution"]
        graph.append(entity)
    for agent in manifest["scientific"]["agents"]:
        agent_type = {"person": "Person", "software-agent": "SoftwareApplication"}.get(
            agent["agentKind"], "Organization"
        )
        entity = {
            "@id": agent["id"],
            "@type": agent_type,
            "name": _label(agent["labels"]),
        }
        if agent.get("affiliationAgentIds"):
            entity["affiliation"] = [
                {"@id": value} for value in agent["affiliationAgentIds"]
            ]
        same_as = [agent[key] for key in ("orcid", "ror") if agent.get(key)]
        if same_as:
            entity["sameAs"] = [{"@id": value} for value in same_as]
        graph.append(entity)
    for software in manifest["scientific"]["softwareEnvironments"]:
        graph.append(
            {
                "@id": software["id"],
                "@type": "SoftwareApplication",
                "name": software["name"],
                "softwareVersion": software["version"],
            }
        )
    for realization in manifest["realizations"]:
        asset = assets[realization["assetId"]]
        entity = {
            "@id": realization["id"],
            "@type": "File",
            "name": _label(asset["labels"]),
            "encodingFormat": realization["mediaType"],
            "contentSize": str(realization["byteSize"]),
            "sha256": realization["sha256"],
        }
        applicable_rights = [
            rights
            for rights in manifest["rights"]
            if realization["id"] in rights["appliesToIds"]
        ]
        if applicable_rights:
            entity["license"] = [{"@id": rights["id"]} for rights in applicable_rights]
        graph.append(entity)
    for activity in activities:
        entity = {
            "@id": activity["id"],
            "@type": "CreateAction",
            "name": f"VAO {activity['activityKind']} activity",
            "actionStatus": "CompletedActionStatus",
            "startTime": activity["startedAt"],
            "endTime": activity["endedAt"],
            "agent": [{"@id": value} for value in activity["agentIds"]],
            "object": [{"@id": value} for value in activity["inputIds"]],
            "result": [{"@id": value} for value in activity["outputIds"]],
        }
        if activity.get("softwareEnvironmentId"):
            entity["instrument"] = {"@id": activity["softwareEnvironmentId"]}
        graph.append(entity)

    declared = {entity["@id"] for entity in graph}
    activity_references = {
        identifier
        for activity in activities
        for key in ("inputIds", "outputIds")
        for identifier in activity[key]
    }
    for identifier in sorted(activity_references - declared):
        graph.append(
            {
                "@id": identifier,
                "@type": "Thing",
                "name": identifier,
            }
        )
    return {"@context": RO_CRATE_CONTEXT, "@graph": graph}


def datacite(manifest: dict[str, Any]) -> dict[str, Any]:
    _require_valid(manifest)
    agents = {x["id"]: x for x in manifest["scientific"]["agents"]}
    discovery = manifest["discovery"]

    def agent_metadata(identifier: str) -> dict[str, Any]:
        agent = agents[identifier]
        result: dict[str, Any] = {
            "name": _label(agent["labels"]),
        }
        if agent["agentKind"] == "person":
            result["nameType"] = "Personal"
        elif agent["agentKind"] == "organization":
            result["nameType"] = "Organizational"
        name_identifiers = []
        for field, scheme, scheme_uri in (
            ("orcid", "ORCID", "https://orcid.org"),
            ("ror", "ROR", "https://ror.org"),
        ):
            if agent.get(field):
                name_identifiers.append(
                    {
                        "nameIdentifier": agent[field],
                        "nameIdentifierScheme": scheme,
                        "schemeUri": scheme_uri,
                    }
                )
        if name_identifiers:
            result["nameIdentifiers"] = name_identifiers
        affiliations = []
        for affiliation_id in agent.get("affiliationAgentIds", []):
            affiliation = agents[affiliation_id]
            item = {"name": _label(affiliation["labels"])}
            if affiliation.get("ror"):
                item.update(
                    {
                        "affiliationIdentifier": affiliation["ror"],
                        "affiliationIdentifierScheme": "ROR",
                        "schemeUri": "https://ror.org",
                    }
                )
            affiliations.append(item)
        if affiliations:
            result["affiliation"] = affiliations
        return result

    publisher = discovery.get("publisher")
    publication_year = discovery.get("publicationYear")
    if not publisher or not publication_year:
        raise ValueError(
            "DataCite projection requires discovery.publisher and discovery.publicationYear"
        )

    def subject(record: dict[str, Any]) -> dict[str, Any]:
        result = {key: value for key, value in record.items() if key != "valueIRI"}
        if record.get("valueIRI"):
            result["valueUri"] = record["valueIRI"]
        return result

    def funding(record: dict[str, Any]) -> dict[str, Any]:
        result = {key: value for key, value in record.items() if key != "awardIRI"}
        if record.get("awardIRI"):
            result["awardUri"] = record["awardIRI"]
        return result

    def related(record: dict[str, Any]) -> dict[str, Any]:
        identifier = record["identifier"]
        identifier_type = record["identifierType"]
        if identifier_type == "DOI":
            identifier = identifier.removeprefix("https://doi.org/").removeprefix(
                "http://doi.org/"
            )
        result = {
            "relatedIdentifier": identifier,
            "relatedIdentifierType": identifier_type,
            "relationType": record["relationType"],
        }
        if record.get("resourceType"):
            result["resourceTypeGeneral"] = record["resourceType"]
        if record.get("relationTypeInformation"):
            result["relationTypeInformation"] = record["relationTypeInformation"]
        if record.get("schemeUri"):
            result["schemeUri"] = record["schemeUri"]
        return result

    rights_scope = {manifest["id"], manifest["release"]["id"]}
    rights_list = [
        {
            **({"rightsUri": record["license"]} if record.get("license") else {}),
            "rights": _label(record["statement"]),
        }
        for record in manifest["rights"]
        if rights_scope.intersection(record["appliesToIds"])
    ]
    return {
        "data": {
            "type": "dois",
            "attributes": {
                "titles": [{"title": _label(manifest["title"])}],
                "publisher": {"name": publisher},
                "publicationYear": publication_year,
                "types": {"resourceTypeGeneral": discovery["resourceType"]},
                "creators": [agent_metadata(x) for x in discovery["creatorAgentIds"]],
                "contributors": [
                    {**agent_metadata(x), "contributorType": "Other"}
                    for x in discovery["contributorAgentIds"]
                ],
                "subjects": [subject(x) for x in discovery["subjects"]],
                "fundingReferences": [
                    funding(x) for x in discovery["fundingReferences"]
                ],
                "relatedIdentifiers": [
                    related(x) for x in discovery["relatedIdentifiers"]
                ],
                "descriptions": (
                    [
                        {
                            "description": _label(manifest["description"]),
                            "descriptionType": "Abstract",
                        }
                    ]
                    if manifest.get("description")
                    else []
                ),
                "rightsList": rights_list,
                "formats": sorted({x["mediaType"] for x in manifest["realizations"]}),
                "version": manifest["release"]["contentVersion"],
                "schemaVersion": "http://datacite.org/schema/kernel-4",
            },
        }
    }


def iiif_presentation(manifest: dict[str, Any]) -> dict[str, Any]:
    _require_valid(manifest)
    realizations = {x["id"]: x for x in manifest["realizations"]}
    canvases = []
    for track in manifest["multimodal"]["tracks"]:
        realization = realizations[track["realizationId"]]
        duration = realization["technicalMetadata"].get("durationSeconds")
        if (
            duration is None
            and realization["technicalMetadata"].get("frameCount")
            and realization["technicalMetadata"].get("sampleRate")
        ):
            duration = (
                realization["technicalMetadata"]["frameCount"]
                / realization["technicalMetadata"]["sampleRate"]
            )
        body_type = {
            "audio": "Sound",
            "video": "Video",
            "image": "Image",
            "image-sequence": "Image",
        }.get(track["modality"], "Dataset")
        canvas = {
            "id": track["id"],
            "type": "Canvas",
            "label": {"en": [track["modality"]]},
            "items": [
                {
                    "id": track["id"] + "/page",
                    "type": "AnnotationPage",
                    "items": [
                        {
                            "id": track["id"] + "/body",
                            "type": "Annotation",
                            "motivation": "painting",
                            "body": {
                                "id": realization["id"],
                                "type": body_type,
                                "format": realization["mediaType"],
                            },
                            "target": track["id"],
                        }
                    ],
                }
            ],
        }
        if duration is not None:
            canvas["duration"] = duration
        canvases.append(canvas)
    return {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": manifest["id"] + "/iiif",
        "type": "Manifest",
        "label": {"en": [_label(manifest["title"])]},
        "items": canvases,
    }


def ocfl_inventory(manifest: dict[str, Any]) -> dict[str, Any]:
    _require_valid(manifest)
    state: dict[str, list[str]] = {}
    for realization in manifest["realizations"]:
        logical_name = hashlib.sha256(realization["id"].encode("utf-8")).hexdigest()
        state.setdefault(realization["sha256"], []).append(
            f"payload/by-id/{logical_name}"
        )
    content = {digest: [f"v1/content/blobs/{digest}"] for digest in state}
    return {
        "id": manifest["id"],
        "type": "https://ocfl.io/1.1/spec/#inventory",
        "digestAlgorithm": "sha256",
        "head": "v1",
        "manifest": content,
        "versions": {
            "v1": {
                "created": manifest["createdAt"],
                "message": "VAO semantic release",
                "state": state,
            }
        },
    }


PROJECTIONS = {
    "ro-crate": ro_crate,
    "datacite": datacite,
    "iiif": iiif_presentation,
    "ocfl": ocfl_inventory,
}


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("projection", choices=PROJECTIONS)
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    report = vao05.validate_manifest(manifest)
    if not report["valid"]:
        raise SystemExit("Invalid VAO 0.5.0: " + "; ".join(report["errors"][:3]))
    try:
        projected = PROJECTIONS[args.projection](manifest)
    except (KeyError, TypeError, ValueError) as exc:
        raise SystemExit(f"Cannot create {args.projection} projection: {exc}") from exc
    print(json.dumps(projected, indent=2, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
