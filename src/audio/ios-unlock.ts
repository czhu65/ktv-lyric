// iOS Safari mutes Web Audio API output whenever the phone's ring/silent
// switch is set to silent -- a real, longstanding WebKit limitation
// (webkit.org bug 237322, still open as of 2026): the default audio session
// type is 'ambient', which the OS treats like a system sound effect (the
// camera shutter, keyboard clicks) and mutes exactly like it mutes those.
// AudioContext.resume() and a genuine user gesture do not change this -- the
// clip genuinely plays, just inaudibly, which is why this looks identical
// from the outside to a real decode failure (see load()'s swallowed errors
// in index.ts) or a missing manifest. Everything else in the app -- search,
// annotation, the ruby text -- has nothing to do with audio and keeps
// working, which is the exact symptom this produces: "the reading shows,
// nothing plays."
//
// Two independent mitigations, meant to run ONCE per page load, inside the
// same user gesture that first resumes the AudioContext (see index.ts's
// unlock(), which is the only caller):
//
//   1. navigator.audioSession.type = 'playback' -- the modern, correct fix.
//      Safari-only and recent (an Editor's Draft as of November 2025), so it
//      is feature-detected rather than relied on for older iOS versions.
//   2. Play a silent <audio> element once. This is the long-standing
//      universal workaround (used by e.g. github.com/feross/unmute-ios-audio):
//      letting a real HTMLAudioElement play under the user's authorization
//      appears to move the page's whole audio session off the muted
//      'ambient' channel, including subsequent Web Audio API output -- and
//      it does so once, not continuously.
//
// The WAV below is a real, verified file (ffmpeg anullsrc, 8kHz mono 8-bit
// PCM, 10ms, no metadata chunk -- 124 bytes), not a hand-typed guess at a
// base64 string. Inlined as a data: URI so this needs no extra network
// request and no public/ asset to keep in sync with the build.
export const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='

export interface IosUnlockDeps {
  /** Only the one property actually used -- narrower than passing all of
   *  `navigator` in, and trivially fakeable in tests. */
  audioSession?: { type: string }
  // NOT typed as `play(): Promise<void>` -- the DOM lib type says that, but
  // real environments don't always honour it (jsdom's HTMLMediaElement
  // returns plain `undefined`). Typing it honestly as `unknown` is what
  // forces the body below to go through Promise.resolve() rather than
  // assuming a thenable.
  createAudio(src: string): { play(): unknown }
}

// Evaluated lazily (as a default PARAMETER, not a module-level constant), so
// touching the real `navigator`/`Audio` globals only happens on an actual
// call with no injected deps -- which in this codebase is exactly one call
// site, App.tsx's real production wiring. No test that omits
// `unlockIosAudioSession` from createAudioEngine's opts ever reaches this.
function realDeps(): IosUnlockDeps {
  return {
    audioSession: (navigator as Navigator & { audioSession?: { type: string } }).audioSession,
    createAudio: (src) => new Audio(src),
  }
}

export function unlockIosAudioSession(deps: IosUnlockDeps = realDeps()): void {
  if (deps.audioSession) deps.audioSession.type = 'playback'
  // Autoplay policy can still reject this even inside a real gesture on some
  // browser/version combinations. Best-effort: there is nothing useful to do
  // with a rejection, and it must never surface as an unhandled one --
  // which means never assuming play() itself returns a real Promise.
  // HTMLMediaElement.play() is SPEC'D to return one, but not every
  // environment honours that (jsdom's returns `undefined`; so did some real
  // pre-Promise-era browsers). Calling .catch() directly on a non-Promise
  // throws SYNCHRONOUSLY, and since this runs inside unlock() -- on the
  // critical path to every tap and every play -- that throw would abort
  // audio entirely instead of merely failing to unlock it: strictly worse
  // than the iOS-only failure this function exists to work around.
  // Promise.resolve(...) tolerates a non-Promise return; the outer try
  // catches play() throwing outright, which real browsers can also do
  // depending on autoplay-policy state.
  try {
    Promise.resolve(deps.createAudio(SILENT_WAV_DATA_URI).play()).catch(() => {})
  } catch {
    // Nothing useful to do with a synchronous throw either.
  }
}
