# Sound effects

Both games use [SoundCN](https://www.soundcn.xyz/) assets and its `useSound` hook, shared audio engine, and types. The registry copies source into the project; there is no runtime audio package. All selected samples are by Kenney and marked CC0. SoundCN's code is MIT licensed; its notice ships at `/licenses/soundcn-MIT.txt`.

`src/lib/sound.ts` maps game events to assets and volume levels:

| Event             | SoundCN asset      |
| ----------------- | ------------------ |
| Selection         | `click-soft`       |
| Jungle move       | `chip-lay-1`       |
| Capture           | `chips-collide-3`  |
| Dice roll         | `die-throw-2`      |
| Flight step       | `chip-lay-2`       |
| Jump              | `jump-8bit`        |
| Shortcut          | `maximize-005`     |
| Return to airport | `minimize-005`     |
| Plane finishes    | `success-chime`    |
| Win               | `jingles-pizzi-07` |
| Draw              | `low-down`         |

`GameSoundProvider` calls SoundCN's `useSound` for each cue, with `volume`, `interrupt`, and the saved `soundEnabled` preference. It uses SoundCN's shared context for gesture unlocking, stops all cues on mute or when the tab becomes hidden, and drops game events while audio is suspended. Room sounds still follow displayed game transitions, including the Aeroplane animation timeline. Embedded MP3 data is bundled in JavaScript and precached by the PWA, so there are no remote sound requests during play.

The hook, engine, types, and assets were installed from the official registry using the configuration in `components.json`:

```sh
bunx --bun shadcn@latest add @soundcn/use-sound @soundcn/sound-engine @soundcn/sound-types @soundcn/click-soft @soundcn/chip-lay-1 @soundcn/chip-lay-2 @soundcn/chips-collide-3 @soundcn/die-throw-2 @soundcn/jump-8bit @soundcn/maximize-005 @soundcn/minimize-005 @soundcn/success-chime @soundcn/jingles-pizzi-07 @soundcn/low-down
```

Review before updating: the local hook catches decode/resume failures, clears stale decoded buffers, disconnects ended nodes, and guards interrupted playback callbacks. The engine also recreates a closed audio context. Preserve these small adaptations when refreshing upstream files.
