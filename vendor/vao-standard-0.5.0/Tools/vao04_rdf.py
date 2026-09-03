#!/usr/bin/env python3
"""Create a reversible annotated JSON-LD view of a VAO 0.4.0 manifest.

The helper's JSON-to-JSON annotation step is reversible.  RDF expansion is a
semantic projection: RDF dataset ordering and lexical details are not a
substitute for the canonical manifest bytes.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import vao04
import vao_resources


TYPE_BY_REGISTRY = {
    "agents": "http://www.w3.org/ns/prov#Agent",
    "activities": "http://www.w3.org/ns/prov#Activity",
    "observations": "http://www.w3.org/ns/sosa/Observation",
    "analyses": "https://w3id.org/modavis/vao/ontology#Analysis",
    "calibrations": "https://w3id.org/modavis/vao/ontology#Calibration",
    "protocols": "http://www.w3.org/ns/sosa/Procedure",
    "softwareEnvironments": "https://w3id.org/modavis/vao/ontology#SoftwareEnvironment",
    "claims": "https://w3id.org/modavis/vao/ontology#ScientificClaim",
    "reviews": "https://w3id.org/modavis/vao/ontology#Review",
    "consents": "https://w3id.org/modavis/vao/ontology#Consent",
    "timebases": "https://w3id.org/modavis/vao/ontology#Timebase",
    "tracks": "https://w3id.org/modavis/vao/ontology#Track",
    "synchronizationMappings": "https://w3id.org/modavis/vao/ontology#SynchronizationMapping",
    "annotations": "http://www.w3.org/ns/oa#Annotation",
    "components": "https://w3id.org/modavis/vao/ontology#PhysicalComponent",
    "ports": "https://w3id.org/modavis/vao/ontology#Port",
    "connections": "https://w3id.org/modavis/vao/ontology#Connection",
    "sensors": "http://www.w3.org/ns/sosa/Sensor",
    "actuators": "http://www.w3.org/ns/sosa/Actuator",
    "stateBindings": "https://w3id.org/modavis/vao/ontology#StateBinding",
    "randomSources": "https://w3id.org/modavis/vao/ontology#RandomSource",
    "renderers": "https://w3id.org/modavis/vao/ontology#RendererDescriptor",
    "conformanceTraces": "https://w3id.org/modavis/vao/ontology#ConformanceTrace",
    "coordinateFrames": "https://w3id.org/modavis/vao/ontology#CoordinateFrame",
    "poses": "https://w3id.org/modavis/vao/ontology#Pose",
    "geometryBindings": "https://w3id.org/modavis/vao/ontology#GeometryBinding",
    "materialModels": "https://w3id.org/modavis/vao/ontology#MaterialModel",
    "measurements": "https://w3id.org/modavis/vao/ontology#ResponseMeasurement",
    "responseSets": "https://w3id.org/modavis/vao/ontology#ResponseSet",
    "metricSets": "https://w3id.org/modavis/vao/ontology#MetricSet",
    "audioScenes": "https://w3id.org/modavis/vao/ontology#AudioScene",
    "renderConfigurations": "https://w3id.org/modavis/vao/ontology#RenderConfiguration",
    "signalRegions": "https://w3id.org/modavis/vao/ontology#SignalRegion",
    "loopPointSets": "https://w3id.org/modavis/vao/ontology#LoopPointSet",
    "tuningMaps": "https://w3id.org/modavis/vao/ontology#TuningMap",
    "perspectiveGroups": "https://w3id.org/modavis/vao/ontology#PerspectiveGroup",
    "sampleVariants": "https://w3id.org/modavis/vao/ontology#SampleVariant",
    "sampleMappings": "https://w3id.org/modavis/vao/ontology#SampleMapping",
    "controls": "https://w3id.org/modavis/vao/ontology#InteractionControl",
    "eventTypes": "https://w3id.org/modavis/vao/ontology#InteractionEventType",
    "protocolBindings": "https://w3id.org/modavis/vao/ontology#ProtocolBinding",
    "stateVariables": "https://w3id.org/modavis/vao/ontology#StateVariable",
    "transitions": "https://w3id.org/modavis/vao/ontology#InteractionTransition",
    "routingRules": "https://w3id.org/modavis/vao/ontology#RoutingRule",
    "processModels": "https://w3id.org/modavis/vao/ontology#ProcessModel",
    "timingConstraints": "https://w3id.org/modavis/vao/ontology#TimingConstraint",
    "transferFunctions": "https://w3id.org/modavis/vao/ontology#TransferFunction",
    "renderBindings": "https://w3id.org/modavis/vao/ontology#RenderBinding",
    "captureStates": "https://w3id.org/modavis/vao/ontology#CaptureState",
    "eventAlignments": "https://w3id.org/modavis/vao/ontology#EventAlignment",
    "takeSets": "https://w3id.org/modavis/vao/ontology#TakeSet",
    "derivationMaps": "https://w3id.org/modavis/vao/ontology#DerivationMap",
    "logicalAssets": "https://w3id.org/modavis/vao/ontology#LogicalAsset",
    "realizations": "https://w3id.org/modavis/vao/ontology#Realization",
}
CONTAINER_TYPES = {
    "scientific": "https://w3id.org/modavis/vao/ontology#ScientificRecordSet",
    "multimodal": "https://w3id.org/modavis/vao/ontology#MultimodalTimeline",
    "physicalSystem": "https://w3id.org/modavis/vao/ontology#PhysicalSystem",
    "runtime": "https://w3id.org/modavis/vao/ontology#RuntimeContract",
    "interactionModel": "https://w3id.org/modavis/vao/ontology#InteractionModel",
    "acoustics": "https://w3id.org/modavis/vao/ontology#AcousticModelSet",
    "playable": "https://w3id.org/modavis/vao/ontology#PlayableModel",
    "captureDocumentation": "https://w3id.org/modavis/vao/ontology#CaptureDocumentation",
}
CONTAINER_REGISTRIES = {
    "scientific": (
        "agents",
        "activities",
        "observations",
        "analyses",
        "calibrations",
        "protocols",
        "softwareEnvironments",
        "claims",
        "reviews",
        "consents",
    ),
    "multimodal": ("timebases", "tracks", "synchronizationMappings", "annotations"),
    "physicalSystem": (
        "components",
        "ports",
        "connections",
        "sensors",
        "actuators",
        "stateBindings",
    ),
    "runtime": ("randomSources", "renderers", "conformanceTraces"),
    "acoustics": (
        "coordinateFrames",
        "poses",
        "geometryBindings",
        "materialModels",
        "measurements",
        "responseSets",
        "metricSets",
        "audioScenes",
        "renderConfigurations",
    ),
    "playable": (
        "signalRegions",
        "loopPointSets",
        "tuningMaps",
        "perspectiveGroups",
        "sampleVariants",
        "sampleMappings",
    ),
    "interactionModel": (
        "controls",
        "eventTypes",
        "protocolBindings",
        "stateVariables",
        "transitions",
        "routingRules",
        "processModels",
        "timingConstraints",
        "transferFunctions",
        "renderBindings",
        "randomSources",
    ),
    "captureDocumentation": (
        "captureStates",
        "eventAlignments",
        "takeSets",
        "derivationMaps",
    ),
}
ROOT_REGISTRIES = ("logicalAssets", "realizations")
LOCAL_CONTEXT = vao_resources.schema_directory() / "vao-context-0.4.0.jsonld"


def project_jsonld(manifest: dict[str, Any]) -> dict[str, Any]:
    report = vao04.validate_manifest(manifest)
    if not report["valid"]:
        raise ValueError(
            "Cannot project invalid VAO 0.4.0: " + "; ".join(report["errors"][:3])
        )
    value = copy.deepcopy(manifest)
    value["type"] = "https://w3id.org/modavis/vao/ontology#VirtualAcousticObject"

    def annotate(records: Any, registry: str, pointer: str) -> None:
        if not isinstance(records, list) or registry not in TYPE_BY_REGISTRY:
            return
        for index, record in enumerate(records):
            if isinstance(record, dict):
                record.setdefault("type", TYPE_BY_REGISTRY[registry])
                record["vao:jsonPointer"] = f"{pointer}/{index}"

    for registry in ROOT_REGISTRIES:
        annotate(value.get(registry), registry, f"/{registry}")
    for container_key, container_type in CONTAINER_TYPES.items():
        container = value.get(container_key)
        if not isinstance(container, dict):
            continue
        container.setdefault("type", container_type)
        container["vao:jsonPointer"] = f"/{container_key}"
        for registry in CONTAINER_REGISTRIES[container_key]:
            annotate(container.get(registry), registry, f"/{container_key}/{registry}")
    return value


def project_offline_jsonld(manifest: dict[str, Any]) -> dict[str, Any]:
    """Project with the exact local VAO context and no network-dependent contexts."""
    if manifest.get("@context") != [vao04.CONTEXT_URI]:
        raise ValueError(
            "The reference offline projector supports only the canonical VAO context; "
            "pin, review, and process additional contexts with another implementation."
        )
    value = project_jsonld(manifest)
    value["@context"] = json.loads(LOCAL_CONTEXT.read_text(encoding="utf-8"))[
        "@context"
    ]
    return value


def inverse_projection(projected: dict[str, Any]) -> dict[str, Any]:
    """Remove only annotations introduced by :func:`project_jsonld`."""
    value = copy.deepcopy(projected)
    value["type"] = "VirtualAcousticObject"

    def remove(records: Any, registry: str) -> None:
        if not isinstance(records, list) or registry not in TYPE_BY_REGISTRY:
            return
        for record in records:
            if isinstance(record, dict):
                record.pop("vao:jsonPointer", None)
                if record.get("type") == TYPE_BY_REGISTRY[registry]:
                    record.pop("type")

    for registry in ROOT_REGISTRIES:
        remove(value.get(registry), registry)
    for container_key, container_type in CONTAINER_TYPES.items():
        container = value.get(container_key)
        if not isinstance(container, dict):
            continue
        container.pop("vao:jsonPointer", None)
        if container.get("type") == container_type:
            container.pop("type")
        for registry in CONTAINER_REGISTRIES[container_key]:
            remove(container.get(registry), registry)
    return value


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument(
        "--annotation-round-trip-check",
        "--round-trip-check",
        dest="round_trip_check",
        action="store_true",
        help="verify that adding and removing projection annotations preserves the manifest object",
    )
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    annotated = project_jsonld(manifest)
    if args.round_trip_check and inverse_projection(annotated) != manifest:
        raise SystemExit("Annotation projection did not preserve the manifest")
    projected = project_offline_jsonld(manifest)
    print(json.dumps(projected, indent=2, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
