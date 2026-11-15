# Napoleon Dynamite Doorbell Club

A private movie-soundbite dashboard and a local Ring speaker listener. Source code belongs in GitHub; authorization tokens, movie audio, and camera recordings do not.

## What currently works

- Private web dashboard with thirteen Napoleon Dynamite clip choices and browser preview.
- Direct outdoor playback through a Ring Doorbell (2nd Gen), manually verified.
- Button-only playback: native chime, then a random movie clip.
- Optional Mac login startup, automatic restart, and idle-sleep prevention.
- Audio-only MP3 preparation, trailing silence, and one retry for early audio-session termination.

Button-only is the default. Experimental motion playback opens a live Ring audio session, which can suppress new button events on the tested model. Priority logic cannot act on events Ring does not deliver. Wireless audio gaps remain unresolved. Full audible playback is not guaranteed by a completed send log.

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

Before every push, review `git diff --cached` and run `npm run check:privacy`. Keep the GitHub repository private. Share only sanitized errors. If a real credential is ever committed, revoke it; deleting it in a later commit is not sufficient.

Run `npm test` for source/build checks. Tests do not connect to a real Ring device. Keep known device limitations in mind when changing the trigger mode or audio pipeline.
