# Third-party data attribution

## English → Indonesian lexicon

FIEZEL can load an expanded vocabulary lexicon from:

`open-dsl-dict/wiktionary-dict`

Source file:
`src/en-id-enwiktionary.txt`

The source repository states that the English→Indonesian dictionary was extracted from Wiktionary and is published under the Creative Commons Attribution-ShareAlike 3.0 Unported License and the GNU Free Documentation License.

Source repository: https://github.com/open-dsl-dict/wiktionary-dict

The FIEZEL runtime treats this as a third-party data source. If you redistribute a downloaded/derived copy of the dictionary data, preserve the applicable attribution and share-alike/license notices.

The locally bundled 1,765-entry learner vocabulary is separate from this third-party source.

## Lucide icons

FIEZEL membundel distribusi Lucide untuk ikon antarmuka.

Project: https://lucide.dev/

License: ISC. Salinan lisensi tersedia di `LUCIDE-LICENSE.txt`.


## web-push 3.6.7
Used only by the scheduled push dispatcher. License: MPL-2.0. Source package: web-push-libs/web-push.


## @heyputer/cli 0.1.2
Used only by the manual/CI Core Worker deployment workflow. License: MIT. The CLI is not bundled into the FIEZEL browser runtime.

## Kokoro.js 1.2.1

Bundled local browser runtime built from `hexgrad/kokoro` commit `d4ef0569c79046dfd77fbb128502546a3afe5bef`. License: Apache-2.0. Exact text: `vendor/kokoro-js/LICENSE`.

## Kokoro-82M v1.0 ONNX model and selected voices

Bundled from `onnx-community/Kokoro-82M-v1.0-ONNX` revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231`. License: Apache-2.0. Exact text: `vendor/kokoro-model/LICENSE`. Model and selected voice files are hash-locked in `NEURAL-VOICE-SOURCE-LOCK.json`.

## @huggingface/transformers 3.5.1

Bundled transitively inside the reviewed Kokoro browser build. License: Apache-2.0. Exact notice: `vendor/kokoro-js/licenses/HUGGINGFACE-TRANSFORMERS-APACHE-2.0.txt`.

## phonemizer 1.2.1

Bundled transitively inside the reviewed Kokoro browser build. License: Apache-2.0. Exact notice: `vendor/kokoro-js/licenses/PHONEMIZER-APACHE-2.0.txt`.

## ONNX Runtime Web 1.22.0-dev.20250409-89f8206ba4

Bundled runtime/WASM dependency. License: MIT. Exact notice: `vendor/kokoro-js/licenses/ONNXRUNTIME-MIT.txt`.

## Supertonic 3 (m025-42 active speech engine)

Bundled at `vendor/supertonic-3/`: the WASM runtime compiled from `k2-fsa/sherpa-onnx`
v1.13.6 (emscripten 4.0.23) plus the int8 model files from the sherpa-onnx release
`sherpa-onnx-supertonic-3-tts-int8-2026-05-11`.

- **Sample code / runtime**: MIT. Exact text: `vendor/supertonic-3/LICENSE`
  (Supertone Inc. 2025, shipped inside the release archive).
- **Model weights**: OpenRAIL-M, per the upstream model card at
  `supertone-inc/supertonic`. Free of charge; the licence adds use-restrictions
  (no illegal or harmful use) rather than fees.
- **Cost**: none. Inference is fully on-device — no API key, no metered billing, no
  cross-origin inference. This is the same zero-cost policy the retired engines ran
  under, re-verified in `NEURAL-VOICE-SOURCE-LOCK.json`.
- **sherpa-onnx** itself: Apache-2.0 (`k2-fsa/sherpa-onnx`).

Per-file SHA-256 values: `vendor/supertonic-3/provenance/SHA256SUMS.txt`.
Build provenance and the exact deviations from the upstream build script:
`vendor/supertonic-3/provenance/m02542-build.json` and `tools/build-supertonic-wasm.sh`.

### Retired with m025-42

`vendor/sherpa-vits/` (Piper `en_US-libritts_r-medium`) and `vendor/sherpa-vits-id/`
(Piper `id_ID-news_tts-medium`) are no longer loaded by the app. They remain in the
tree for one release as a rollback path and are removed once the device gate passes.


## Puter cloud TTS

FIEZEL uses the externally loaded Puter.js v2 SDK (`https://js.puter.com/v2/`) for
cloud text-to-speech through `puter.ai.txt2speech`. The primary m025-49 path requests
OpenAI `gpt-4o-mini-tts` through Puter and decodes the returned audio into the same
Web Audio PCM player used by the local engine.

- **Billing model**: Puter **User-Pays**. AI/TTS usage is charged against the signed-in
  Puter user's allowance/account, not a developer API key embedded in FIEZEL.
- **Client secret**: none. FIEZEL relies on the user's Puter session and ships no vendor
  API key.
- **Offline behavior**: the bundled Supertonic 3 engine remains the automatic offline
  and cloud-failure fallback.
- **Speculative billing**: cloud prefetch is disabled; speculative pre-rendering warms
  only the local Supertonic fallback.
- **Service terms**: Puter-hosted services and upstream AI models are governed by their
  applicable service terms; they are not redistributed as model weights in this repo.
