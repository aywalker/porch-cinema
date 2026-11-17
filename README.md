# Porch Cinema

A movie-soundbite dashboard and local Ring speaker listener. This public repository shares the source code only. Ring authorization, movie audio, camera recordings, and private hosting configuration stay on each user’s own system.

## What currently works

- Private web dashboard with thirteen Napoleon Dynamite clip choices and browser preview.
- Direct outdoor playback through a Ring Doorbell (2nd Gen), manually verified.
- Button playback: native chime, then a random movie clip.
- Motion-priority playback: three complete random clips are rendered as one audio playlist and sent through one live-talk session. Motion and button events during that conversation do not interrupt or queue more sessions. An idle button still triggers a single clip.
- Optional Mac login startup, automatic restart, and idle-sleep prevention.
- Audio-only MP3 preparation, trailing silence, and one retry for early audio-session termination.

Motion-priority is the default. Each motion event received while idle starts a bounded three-clip conversation, using the existing silent tails as pauses. The playlist contains complete clips and does not cut them at an arbitrary session duration. More motion/button events during playback are acknowledged but do not extend or interrupt it; after it finishes, a new motion event can start a new conversation. This is not presence detection and cannot determine when someone leaves. Ring may suppress new events during live talk or remain busy briefly after it closes. Multi-clip playback uses the already-tested audio path but still needs an audible test on the physical doorbell. Wireless audio gaps remain unresolved. A completed transmission does not guarantee that every word was audible.

Set `NAPOLEON_TRIGGER_MODE=button-only` for button-only foreground playback, or `motion-and-button` for the older experimental button-priority behavior.

Live video, a recorded-video timeline, persistent hosted settings, and browser controls for the local background service are not implemented. This listener talks directly to Ring; the Home Assistant VM is not required for it.

## Install dependencies

Use Node.js 22 or 24 and FFmpeg. Run `npm ci` from this repository. The lockfile pins the tested Ring library and an override to `@eneris/push-receiver` 4.4.0, which fixes the push decryption bug seen with 4.3.0. Do not run `npm audit fix --force`: it can downgrade the Ring library. The remaining `ip`/`werift` audit advisory is not fixed by that override; review it before wider deployment.

## Local audio and authorization

1. Copy your existing local movie clips into `listener/clips/`.
2. Copy `listener/clips.example.json` to `listener/clips.json`, and verify the durations match your audio files. These runtime files are ignored by Git.
3. Keep the existing Ring token in the local `.ring-token` file. The Mac installer can use a token already stored by the existing background service, in `listener/.ring-token`, or in the previous `Documents/napoleon-doorbell` installation.
4. If new authorization is needed, run `npx ring-auth-cli` locally and save only its refresh token privately. Never send it in chat, put it in an issue, or commit it.
5. Start a foreground listener with `npm run listener`. Type `test`, `mute`, `unmute`, `status`, or `stop` and press Enter. Use `caffeinate -i npm run listener` on a Mac for an awake foreground test.

The token is rotated and saved locally. Do not run multiple listeners sharing a token simultaneously.

## Background operation on a Mac

Stop any previous foreground listener first. Run `npm run background:install`. It copies the runtime into `~/Library/Application Support/Napoleon Doorbell`, keeps the token private, and installs a user LaunchAgent.

- `npm run background:status`
- `npm run background:stop`
- `npm run background:start`
- `node listener/manage-background.mjs uninstall`

The Mac must remain logged in, awake, network-connected, and with the lid open. Screen locking and display sleep are fine. The service restarts after an exit and starts at login, not before login after a reboot. Logs are local under `~/Library/Logs/Napoleon Doorbell`.

Existing background installations retain their own installed dependencies. If repairing one, apply the same push-receiver override in that private runtime folder as well; changing this repository's package.json alone does not update an already copied service.

## Build the web dashboard

Place your own audio outside Git in `private/audio/<clip-id>.mp3`, using the IDs in `web/clips.json`. Run `npm run build`. The build injects those files into `dist/server/index.mjs`; build output must never be committed. Optional local setup downloads can be supplied as `private/napoleon-motion-setup.zip`.

The existing hosted application is separate from GitHub. Pushing this repository does not publish it. Hosting IDs, environment variables, access controls, tokens, and credentials stay out of this repository. Do not make audio or camera streams public to work around authentication.

## Prepare audio

Use local audio files you are entitled to use. Do not add movie audio to this repository, even if the repository is private. Strip cover art and add silence before deploying a clip:

```sh
ffmpeg -i input.mp3 -map 0:a:0 -vn -map_metadata -1 -af apad=pad_dur=1.5 -c:a libmp3lame -ar 24000 -ac 1 -b:a 64k output.mp3
```

Measure the final file with FFprobe and update the ignored `listener/clips.json`. `spokenSeconds` is the original spoken file duration; `seconds` includes the silent tail. The shortened Chapstick clip and other local edits must be transferred separately from your existing files.

## Privacy and maintenance

This repository starts with fresh Git history: it does not contain the previous deployment repository's embedded media or generated archives. `.gitignore` excludes secrets, runtime authorization, audio/video, logs, databases, dependencies, and builds. The pre-commit hook checks staged paths, binary files, common credential patterns, and large embedded payloads. This reduces mistakes; it is not a guarantee that every possible secret will be caught.

Before every push, review `git diff --cached` and run `npm run check:privacy`. This repository is intended for public source sharing; keep local media, authorization, and generated builds excluded. Share only sanitized errors. If a real credential is ever committed, revoke it; deleting it in a later commit is not sufficient.

Run `npm test` for source/build checks. Tests do not connect to a real Ring device. Keep known device limitations in mind when changing the trigger mode or audio pipeline.

To opt into button-only mode for a foreground run, use `NAPOLEON_TRIGGER_MODE=button-only npm run listener`. The Mac background installer explicitly enables motion-priority. Replace motion-runner.mjs, conversation.mjs and install-background.mjs together, then rerun the installer.
