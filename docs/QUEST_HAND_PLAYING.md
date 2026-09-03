# Experimental Quest hand-playing mode

## Implemented runtime

The Quest route exposes two explicit WebXR launch modes. **Play with hands**
preloads one user-selected stop, makes all five stops available, and enables direct key and register interaction;
**Watch performance** retains the synchronized recording and baked key motion.
Keeping these modes separate prevents the performance mixer from competing
with physical key input and avoids loading sample packs when the user only
wants the recording.

The organ delivery model exposes 45 playable nodes named `M1.<midi>`. At model
load, the hand player audits those nodes, records their local bounds and rest
rotations, and creates a broad-phase keyboard volume. A missing playable-key
set fails the Quest session instead of silently presenting a nonfunctional
instrument.

## Hand interaction

The WebXR session requests the standard optional `hand-tracking` feature. On
each XR frame, the player reads all five fingertip joint poses from every
tracked hand, transforms the joint centres and radii into organ-local space,
and rejects points outside the expanded keyboard volume. Narrow-phase
selection uses the fingertip sphere against key bounds and prefers the raised
key when black and white volumes overlap.

A note begins only after a fingertip approaches from above and crosses the
key's press plane while moving down. Release uses a wider spatial hysteresis
band and a short re-trigger debounce to absorb tracking noise. Contacts are
tracked by input source, fingertip and MIDI note, so two fingers on the same
key do not restart its sample and the note remains held until the final contact
leaves. Each pressed node follows the source instrument's known four-degree
key travel.

Loss of a fingertip pose releases that contact immediately. Moving or resetting
the organ, removing an input source, leaving play mode, ending the XR session,
or disposing the player invokes the audio panic path so a looped voice cannot
remain stuck. Small fingertip indicators provide contact feedback. When Quest
is tracking controllers instead of hands, pointing at a key and holding the
trigger uses the same note-on/note-off path as a fallback.

## Physical stop interaction

The five model nodes `REG.1` through `REG.5` are audited at startup and mapped
to the original Unity rank order: Gedackt, Principal 4′, Principal 2′, Quinte
2⅔′, and Regal 8′. A fingertip entering a stop's physical bounds toggles it;
the release band prevents tracking jitter from toggling it repeatedly. A
controller ray and trigger provide the same toggle when controllers are in use.

Each stop interpolates between its rest quaternion and the first deliberate
register movement preserved in the Unity-authored Pachelbel animation. This
retains the original pivoted, lateral-looking mechanical motion instead of
inventing an unrelated translation. Deactivating a rank releases only that
rank's held voices. Activating a rank while keys are held starts those notes for
the new rank, matching an organ's live registration behavior.

## Audio path

All five verified manifests and their centre notes are loaded before the
floor-placement state becomes available. The selected initial stop's complete
45-note set is prewarmed in a bounded 116 MiB decoded-buffer cache. Other ranks
decode individual notes on first use, avoiding the memory cost of five fully
decoded sample sets while still making every physical stop immediately usable.

Quest playing reuses `WebAudioEngine`: every realization is SHA-256 verified,
decoded with Opus/AAC fallback, prepared from the VAO sustain start, exclusive
end and crossfade markers, and played with a native looping
`AudioBufferSourceNode`. The attack plays once, the prepared sustain repeats
while contact is held, and release applies the declared 0.3-second envelope.
The engine's master bus feeds a Three.js HRTF `PannerNode` attached to the organ
console, so live notes remain spatially anchored to the placed instrument.

## Remaining headset acceptance work

The implementation has deterministic collision, hysteresis, loop and cleanup
tests, but remains labelled experimental until it is tuned on the physical
Quest 3. The headset pass must cover slow and fast presses, adjacent black and
white keys, chords, repeated notes, tracking loss/occlusion, controller-to-hand
switching, scale changes, relocation, session exit, and sustained notes across
several loop cycles. Threshold changes should be based on those observations,
not desktop emulation alone.

## Physical calibration and controller tools

The delivery model now restores the assembled Unity AR scene's uniform
`0.223 m/source-unit` root scale instead of deriving scale from an assumed
1.1 m open-door bounding box. At that scale the modeled manual is about 0.60 m
wide. It is also consistent with the museum record for inventory 243 (closed
case: 2.49 m high, 1.17 m wide and 0.80 m deep); the delivery bounds are wider
because the scanned model includes the open doors and projections. The model is
already baked into metres, so WebXR no longer applies the manifest width a
second time.

Key collision bounds are derived from each mesh directly in organ-local space.
Fingertips are transformed into the same space, including their tracked radius,
so visual keys and contact volumes stay together at every outer scale.

Hands are now reserved exclusively for the instrument. Uniform scaling uses the
left controller thumbstick, with either stick press returning to life size. The
artificial spotlight uses two small, depth-tested world-space affordances with
larger invisible controller-ray hit radii. Holding trigger on the amber source
moves it while it remains directed at the aim point; holding trigger on the cyan
target aims the beam. Idle handle and beam opacity is deliberately low, and the
spotlight's output is reduced and softened so it improves material readability
without competing visually with the organ.
