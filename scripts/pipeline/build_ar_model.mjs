import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnimationChannel, AnimationSampler, getBounds, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { Euler, MathUtils, Quaternion } from "three";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = join(projectRoot, "public/vao/releases/0.5.0-2/workspace/payload/media/models/organ.glb");
const outputPath = join(projectRoot, "public/media/models/organ-ar.glb");
const iosOutputPath = join(projectRoot, "public/media/models/organ-ar.usdz");
const reportPath = join(projectRoot, "public/media/reports/organ-ar.json");
const timelinePath = join(projectRoot, "public/vao/releases/0.5.0-2/workspace/payload/media/performance/pachelbel.json");
const instrumentPath = join(projectRoot, "content/instrument.json");
const cliPath = join(projectRoot, "node_modules/.bin/gltf-transform");
// The Unity AR scene used 0.223 uniformly for this assembled scan. That scale
// gives a 0.60 m manual and agrees with the museum's 2.49 × 1.17 × 0.80 m case
// dimensions once the model's open doors and decorative projection are
// accounted for. Scaling from the open-door X bounding box (the previous 1.1 m
// assumption) made every playable part about 43% too small.
const simplifyRatio = 1;
const simplifyError = 0;
const textureMaxDimension = 2048;

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const roundVector = (values) => values.map((value) => Number(value.toFixed(6)));

await Promise.all([
  mkdir(dirname(outputPath), { recursive: true }),
  mkdir(dirname(reportPath), { recursive: true }),
  MeshoptDecoder.ready,
  MeshoptEncoder.ready,
]);

const temporaryDirectory = await mkdtemp(join(tmpdir(), "vaoxr-ar-model-"));
const physicallyScaledPath = join(temporaryDirectory, "organ-ar-physical.glb");

try {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });
  const document = await io.read(sourcePath);
  document.getRoot().listExtensionsUsed()
    .filter((extension) => extension.extensionName === "EXT_meshopt_compression")
    .forEach((extension) => extension.dispose());
  const [timeline, instrument] = await Promise.all([
    readFile(timelinePath, "utf8").then(JSON.parse),
    readFile(instrumentPath, "utf8").then(JSON.parse),
  ]);
  const performanceSync = instrument.performance.sync;
  if (performanceSync?.mode !== "native-time-clamp") throw new Error("The AR delivery model requires an explicit native-time performance calibration.");
  const sourceUnitMetres = instrument.model.physicalCalibration?.sourceUnitMetres;
  if (!Number.isFinite(sourceUnitMetres) || sourceUnitMetres <= 0) throw new Error("The VAO instrument configuration requires a positive source-unit calibration.");
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (!scene) throw new Error("The canonical organ model does not contain a scene.");

  const sourceBounds = getBounds(scene);
  const sourceSize = sourceBounds.max.map((value, index) => value - sourceBounds.min[index]);
  const sourceWidth = sourceSize[0];
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) throw new Error("The canonical organ width is invalid.");

  const physicalScale = sourceUnitMetres;
  const targetWidthMetres = sourceWidth * physicalScale;
  const sourceCenterX = (sourceBounds.min[0] + sourceBounds.max[0]) / 2;
  const sourceCenterZ = (sourceBounds.min[2] + sourceBounds.max[2]) / 2;
  const placementRoot = document.createNode("AR floor placement");
  const sceneChildren = [...scene.listChildren()];
  sceneChildren.forEach((child) => placementRoot.addChild(child));
  placementRoot.setScale([physicalScale, physicalScale, physicalScale]);
  placementRoot.setTranslation([
    -sourceCenterX * physicalScale,
    -sourceBounds.min[1] * physicalScale,
    -sourceCenterZ * physicalScale,
  ]);
  scene.addChild(placementRoot);

  // The Unity animation is stored as Euler deltas so it can remain an auditable
  // VAO realization. Convert those deltas to native glTF quaternion channels for
  // delivery runtimes (model-viewer, Scene Viewer, Quick Look, and WebXR).
  const animation = document.createAnimation("Pachelbel performance");
  const animationBuffer = document.getRoot().listBuffers()[0] ?? document.createBuffer("AR model data");
  const nodesByName = new Map(document.getRoot().listNodes().map((node) => [node.getName(), node]));
  for (const track of timeline.tracks) {
    const node = nodesByName.get(track.node);
    if (!node) throw new Error(`Animation target is missing from AR model: ${track.node}`);
    const baseRotation = node.getRotation();
    const baseEuler = new Euler().setFromQuaternion(new Quaternion(...baseRotation), "XYZ");
    const times = new Float32Array(track.keys.length);
    const rotations = new Float32Array(track.keys.length * 4);
    let previous = new Quaternion(...baseRotation);
    track.keys.forEach(([sourceTime, deltaX, deltaY, deltaZ], index) => {
      // The MP3 is longer because it contains a 3.58 s silent/reverb tail; it
      // is not a slower performance. Preserve Unity's native animation time.
      times[index] = sourceTime + performanceSync.audioTimeAtAnimationStartSeconds;
      const euler = new Euler(
        baseEuler.x + MathUtils.degToRad(deltaX),
        baseEuler.y + MathUtils.degToRad(deltaY),
        baseEuler.z + MathUtils.degToRad(deltaZ),
        "XYZ",
      );
      const rotation = new Quaternion().setFromEuler(euler).normalize();
      if (index > 0 && previous.dot(rotation) < 0) rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
      rotation.toArray(rotations, index * 4);
      previous = rotation;
    });
    const input = document.createAccessor(`${track.node} performance time`).setArray(times).setBuffer(animationBuffer);
    const output = document.createAccessor(`${track.node} performance rotation`).setArray(rotations).setBuffer(animationBuffer).setType("VEC4");
    const sampler = document.createAnimationSampler(`${track.node} performance sampler`)
      .setInterpolation(AnimationSampler.Interpolation.LINEAR)
      .setInput(input)
      .setOutput(output);
    const channel = document.createAnimationChannel(`${track.node} rotation`)
      .setTargetNode(node)
      .setTargetPath(AnimationChannel.TargetPath.ROTATION)
      .setSampler(sampler);
    animation.addSampler(sampler).addChannel(channel);
  }

  // Preserve the canonical mesh normals, UVs, and materials. The previous
  // Blender round-trip visibly corrupted the photogrammetry shading on Quest;
  // only the image encoding needs to change for broad AR-viewer support.
  for (const texture of document.getRoot().listTextures()) {
    const sourceImage = texture.getImage();
    if (!sourceImage) continue;
    const jpeg = await sharp(sourceImage)
      .resize({ width: textureMaxDimension, height: textureMaxDimension, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toBuffer();
    texture.setImage(jpeg).setMimeType("image/jpeg");
  }
  document.getRoot().listExtensionsUsed()
    .filter((extension) => extension.extensionName === "EXT_texture_webp")
    .forEach((extension) => extension.dispose());
  await io.write(physicallyScaledPath, document);

  execFileSync(cliPath, [
    "optimize",
    physicallyScaledPath,
    outputPath,
    "--compress", "draco",
    "--flatten", "false",
    "--join", "false",
    "--instance", "false",
    "--palette", "false",
    "--simplify", "false",
    "--simplify-ratio", String(simplifyRatio),
    "--simplify-error", String(simplifyError),
    "--texture-compress", "false",
    "--prune", "true",
    "--weld", "true",
  ], { stdio: "inherit" });
  execFileSync(cliPath, ["validate", outputPath], { stdio: "inherit" });

  const [sourceBytes, outputBytes, outputStats] = await Promise.all([
    readFile(sourcePath),
    readFile(outputPath),
    stat(outputPath),
  ]);
  const physicalSize = sourceSize.map((value) => value * physicalScale);
  const physicalBounds = {
    min: roundVector([-physicalSize[0] / 2, 0, -physicalSize[2] / 2]),
    max: roundVector([physicalSize[0] / 2, physicalSize[1], physicalSize[2] / 2]),
  };

  const animationReport = {
    name: animation.getName(),
    durationSeconds: timeline.sourceDurationSeconds + performanceSync.audioTimeAtAnimationStartSeconds,
    audioDurationSeconds: timeline.audioDurationSeconds,
    mapping: performanceSync.mode,
    audioTimeAtAnimationStartSeconds: performanceSync.audioTimeAtAnimationStartSeconds,
    measuredAudibleStartSeconds: performanceSync.measuredAudibleStartSeconds,
    measuredAudibleEndSeconds: performanceSync.measuredAudibleEndSeconds,
    measuredTrailingSilenceSeconds: performanceSync.measuredTrailingSilenceSeconds,
    measurement: performanceSync.measurement,
    sourceTimeline: "/vao/releases/0.5.0-2/workspace/payload/media/performance/pachelbel.json",
    trackCount: timeline.tracks.length,
  };
  const previousReport = await readFile(reportPath, "utf8").then(JSON.parse).catch(() => undefined);
  const iosBytes = await readFile(iosOutputPath).catch(() => undefined);
  const previousIos = previousReport?.iosDerivative;
  const verifiedIos = iosBytes && previousIos?.sha256 === digest(iosBytes) && previousIos?.byteLength === iosBytes.byteLength
    ? { ...previousIos, animation: animationReport }
    : undefined;

  await writeFile(reportPath, `${JSON.stringify({
    profile: "vaoxr-ar-delivery-model-v1",
    generatedAt: new Date().toISOString(),
    source: {
      vaoRelease: "0.5.0-2",
      realizationId: "urn:vaoxr:realization:media:models:organ:glb",
      path: "/vao/releases/0.5.0-2/workspace/payload/media/models/organ.glb",
      sha256: digest(sourceBytes),
      bounds: {
        min: roundVector(sourceBounds.min),
        max: roundVector(sourceBounds.max),
      },
    },
    derivative: {
      path: "/media/models/organ-ar.glb",
      sha256: digest(outputBytes),
      byteLength: outputStats.size,
      boundsMetres: physicalBounds,
      physicalWidthMetres: targetWidthMetres,
      calibration: {
        sourceUnitMetres,
        method: "Recovered Unity AR scene root scale and checked against museum object measurements",
        reference: "https://mimo-international.com/MIMO/doc/IFD/OAI_ULEI_M0000243",
        caseDimensionsMetres: { height: 2.49, width: 1.17, depth: 0.8 },
        note: "Delivery bounds include open doors and other projections beyond the closed case dimensions.",
      },
      floorAligned: true,
      compression: "KHR_draco_mesh_compression",
      textureFormat: "jpeg",
      textureMaxDimension,
      simplifyRatio,
      simplifyError,
      geometryBudget: {
        staticBodyRatio: simplifyRatio,
        targetTriangles: 530000,
        tool: "Canonical topology and normals preserved; Draco transfer compression",
      },
      animation: animationReport,
    },
    ...(verifiedIos ? { iosDerivative: verifiedIos } : {}),
  }, null, 2)}\n`, "utf8");

  console.log(`AR delivery model: ${(outputStats.size / 1_000_000).toFixed(2)} MB`);
  console.log(`Physical bounds: ${JSON.stringify(physicalBounds)}`);
  console.log(`Report: ${reportPath}`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
